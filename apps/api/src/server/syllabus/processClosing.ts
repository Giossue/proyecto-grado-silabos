import { HttpFailure, Missing } from "../http/failures"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, AppSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { requestInput, type PhpArray } from "../http/input"
import { forbidden, apiJson, validationError } from "../http/responses"
import { redoConfirmationSchema } from "@silabos/shared/schemas/syllabus"
import { validateSchema } from "../http/schemaValidation"
import { isRecord, type PhpRecord } from "../configuration/phpValues"
import { hasRole, PROCESS_OPEN, PROCESS_PAUSED, ROLE_ADMINISTRATOR } from "./policy"
import type { ProcessRepository, ProcessRow } from "./processes"
import { createClosingDeps } from "./processClosingStore"
import { modelNotFound } from "../http/router"
import { MODELS } from "../http/models"

export const CLOSED_DOCUMENT = "closed_document"

export interface ClosingTx {
  lockProcess(id: string): Promise<string | null>
  closeProcess(id: string, keepPausedAt: boolean): Promise<void>
  lockOpenSyllabi(processId: string): Promise<{ id: string; context: unknown }[]>
  snapshot(syllabusId: string): Promise<PhpRecord>
  storeClosedDocument(syllabusId: string, snapshot: PhpRecord): Promise<void>
  closeConvocations(processId: string): Promise<void>
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
export function withClosedDocument(context: unknown, snapshot: PhpRecord): PhpRecord {
  const base: PhpRecord = Array.isArray(context) ? Object.fromEntries(context.map((value, index) => [String(index), value])) : isRecord(context) ? context : {}
  return { ...base, [CLOSED_DOCUMENT]: snapshot }
}

async function boundProcess(request: Request, id: string, deps: ClosingDeps): Promise<{ session: AppSession; process: ProcessRow } | Response> {
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
  return closeBoundProcess(bound.session, bound.process, await requestInput(request), deps)
}

export async function closeBoundProcess(session: AppSession, process: ProcessRow, input: PhpArray, deps: Pick<ClosingDeps, "transaction">): Promise<Response> {
  if (!hasRole(session, ROLE_ADMINISTRATOR) || !CLOSABLE.includes(process.state)) return forbidden()
  const { errors } = await validateSchema(redoConfirmationSchema, input)
  if (errors !== null) return validationError(errors)
  try {
    await deps.transaction(async (tx) => {
      const state = await tx.lockProcess(process.id)
      if (state === null) throw new Missing(MODELS.process, process.id)
      if (!CLOSABLE.includes(state)) throw new StateChanged()
      await tx.closeProcess(process.id, state === PROCESS_PAUSED)
      for (const syllabus of await tx.lockOpenSyllabi(process.id)) {
        await tx.storeClosedDocument(syllabus.id, await tx.snapshot(syllabus.id))
      }
      await tx.closeConvocations(process.id)
    })
  } catch (error) {
    if (error instanceof StateChanged) return validationError({ process: ["El proceso no está en un estado que admita esta acción."] })
    if (error instanceof HttpFailure) return error.response
    throw error
  }
  return apiJson({ message: "Convocatoria cerrada. Sus sílabos quedan solo para consulta." })
}
