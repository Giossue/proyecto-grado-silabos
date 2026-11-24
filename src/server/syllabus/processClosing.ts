import "server-only"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, LaravelSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { isJsonRequest, laravelInput } from "../laravel/input"
import { forbidden, laravelJson, validationError } from "../laravel/responses"
import { validateInput } from "../laravel/validation"
import type { AuditEventInput } from "../operations/recordAuditEvent"
import { isRecord, type PhpRecord } from "../configuration/phpValues"
import { hasRole, PROCESS_OPEN, PROCESS_PAUSED, ROLE_ADMINISTRATOR } from "./policy"
import type { ProcessRepository, ProcessRow } from "./processes"
import { NeedsLaravel } from "./snapshotDocuments"
import { createClosingDeps } from "./processClosingStore"
import { modelNotFound } from "../laravel/router"
import { MODELS } from "../laravel/models"

export const CLOSED_DOCUMENT = "closed_document"

export interface ClosingTx {
  lockProcess(id: string): Promise<string | null>
  closeProcess(id: string, keepPausedAt: boolean): Promise<void>
  lockOpenSyllabi(processId: string): Promise<{ id: string; context: unknown }[]>
  snapshot(syllabusId: string): Promise<PhpRecord>
  storeContext(syllabusId: string, context: PhpRecord): Promise<void>
  closeConvocations(processId: string): Promise<void>
  recordAudit(event: AuditEventInput): Promise<void>
}

export type ClosingDeps = {
  bridge: BridgeDeps
  processes: Pick<ProcessRepository, "find">
  now: () => number
  transaction<T>(work: (tx: ClosingTx) => Promise<T>): Promise<T>
}

export function defaultClosingDeps(): ClosingDeps {
  return { bridge: defaultBridgeDeps(), ...createClosingDeps() }
}

const CLOSABLE = [PROCESS_OPEN, PROCESS_PAUSED]

class StateChanged extends Error {}
class Missing extends Error {}

export function withClosedDocument(context: unknown, snapshot: PhpRecord): PhpRecord {
  const base: PhpRecord = Array.isArray(context) ? Object.fromEntries(context.map((value, index) => [String(index), value])) : isRecord(context) ? context : {}
  return { ...base, [CLOSED_DOCUMENT]: snapshot }
}

async function boundProcess(request: Request, id: string, deps: ClosingDeps): Promise<{ session: LaravelSession; process: ProcessRow } | Response> {
  let process: ProcessRow | null = null
  const session = await requireSession(
    request,
    {
      verified: true,
      activeRole: "required",
      afterAuthentication: async () => {
        process = isUuid(id) ? await deps.processes.find(id) : null
        return process === null ? modelNotFound(MODELS.process, id) : null
      },
    },
    deps.bridge,
  )
  if (session instanceof Response) return session
  if (process === null) return modelNotFound(MODELS.process, id)
  return { session, process }
}

export async function closeProcess(request: Request, id: string, deps: ClosingDeps = defaultClosingDeps()): Promise<Response> {
  const original = request.clone()
  const bound = await boundProcess(original, id, deps)
  if (bound instanceof Response) return bound
  const { session, process } = bound
  if (!hasRole(session, ROLE_ADMINISTRATOR) || !CLOSABLE.includes(process.state)) return forbidden()
  if (request.headers.get("content-type") !== null && !isJsonRequest(request)) return deps.bridge.forward(original)
  const errors = await validateInput(await laravelInput(request), { confirmar_rehacer: ["sometimes", "boolean"] }, { confirmar_rehacer: "confirmación para rehacer los sílabos" })
  if (Object.keys(errors).length > 0) return validationError(errors)
  try {
    await deps.transaction(async (tx) => {
      const state = await tx.lockProcess(process.id)
      if (state === null) throw new Missing()
      if (!CLOSABLE.includes(state)) throw new StateChanged()
      await tx.closeProcess(process.id, state === PROCESS_PAUSED)
      for (const syllabus of await tx.lockOpenSyllabi(process.id)) {
        await tx.storeContext(syllabus.id, withClosedDocument(syllabus.context, await tx.snapshot(syllabus.id)))
      }
      await tx.closeConvocations(process.id)
      await tx.recordAudit({
        actorId: session.user.id,
        roleAssignmentId: session.activeRole?.id ?? null,
        action: "proceso_silabos.cerrado",
        resourceType: "proceso_silabos",
        resourceId: process.id,
        result: "exito",
        metadata: { previous_state: state },
        occurredAt: deps.now(),
      })
    })
  } catch (error) {
    if (error instanceof StateChanged) return validationError({ process: ["El proceso no está en un estado que admita esta acción."] })
    if (error instanceof Missing || error instanceof NeedsLaravel) return deps.bridge.forward(original)
    throw error
  }
  return laravelJson({ message: "Convocatoria cerrada. Sus sílabos quedan solo para consulta." })
}
