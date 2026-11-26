import type { BridgeDeps } from "../auth/types"
import { requestInput, type PhpArray } from "../http/input"
import { apiJson, validationError } from "../http/responses"
import { mallaSchema } from "@silabos/shared/schemas/academic"
import { validateSchema } from "../http/schemaValidation"
import { Rejected, settle } from "../syllabus/reviewDecisions"
import { careerSession, invalid, phpTrim } from "./careerWrites"
import { phpIntCast } from "./governanceWrites"
import { isUuid, type MallaReadRepository, type MallaRecord } from "./structure"

export const MALLA_NOT_FOUND = "La malla no existe en esta carrera."
export const MALLA_CLOSING_REFUSED = "No se puede cerrar la malla: sus materias tienen sílabos en un periodo académico abierto."

export type MallaData = { name: string; cycleCount: number; state: string }
export type MallaColumn = "nombre_malla" | "estado_malla"

/** A career may have several vigente mallas at once: making a malla vigente never touches the others. */
export interface MallaTx {
  lockMalla(careerId: string, mallaId: string): Promise<MallaRecord | null>
  insertMalla(careerId: string, data: MallaData): Promise<string>
  updateMalla(mallaId: string, columns: Partial<Record<MallaColumn, string | null>>): Promise<void>
  /** Whether a subject of the malla has a syllabus in a period that is not closed. */
  hasOpenPeriodSyllabi(mallaId: string): Promise<boolean>
}

export type MallaDeps = {
  bridge: BridgeDeps
  careerActive(careerId: string): Promise<boolean>
  mallas: MallaReadRepository
  mallaNameTaken(careerId: string, name: string, except: string | null): Promise<boolean>
  transaction<T>(work: (tx: MallaTx) => Promise<T>): Promise<T>
}

const STATE_ORDER: Record<string, number> = { vigente: 0, cerrada: 1 }

export function sortedMallas(mallas: MallaRecord[]): MallaRecord[] {
  return [...mallas].sort((left, right) => (STATE_ORDER[left.state] ?? 2) - (STATE_ORDER[right.state] ?? 2) || left.name.localeCompare(right.name, "es"))
}

export function mallaPayload(malla: MallaRecord): Record<string, unknown> {
  return { id: malla.id, name: malla.name, cycle_count: malla.cycleCount, state: malla.state, subject_count: malla.subjectCount }
}

function trimmed(input: PhpArray): PhpArray {
  if (typeof input.name === "string") input.name = phpTrim(input.name)
  return input
}

export async function listMallas(request: Request, deps: MallaDeps, requestedCareerId: string | null = null): Promise<Response> {
  const context = await careerSession(request, deps.bridge, deps.careerActive, requestedCareerId)
  if (context instanceof Response) return context
  return apiJson({ mallas: sortedMallas(await deps.mallas.mallas(context.careerId)).map(mallaPayload) })
}

export async function createMalla(request: Request, deps: MallaDeps, requestedCareerId: string | null = null): Promise<Response> {
  const original = request.clone()
  const context = await careerSession(request.clone(), deps.bridge, deps.careerActive, requestedCareerId)
  if (context instanceof Response) return context
  const input = trimmed(await requestInput(request))
  const { errors } = await validateSchema(mallaSchema({ nameAvailable: async (value) => !(await deps.mallaNameTaken(context.careerId, String(value), null)), updating: false }), input)
  if (errors !== null) return validationError(errors)
  const data: MallaData = { name: input.name as string, cycleCount: phpIntCast(input.cycle_count), state: input.state as string }
  return settle(original, deps, async () => {
    const id = await deps.transaction((tx) => tx.insertMalla(context.careerId, data))
    return apiJson({ message: "Malla creada.", id }, 201)
  })
}

export async function updateMalla(request: Request, mallaId: string, deps: MallaDeps, requestedCareerId: string | null = null): Promise<Response> {
  const original = request.clone()
  const context = await careerSession(request.clone(), deps.bridge, deps.careerActive, requestedCareerId)
  if (context instanceof Response) return context
  if (!isUuid(mallaId) || (await deps.mallas.malla(context.careerId, mallaId)) === null) return apiJson({ message: MALLA_NOT_FOUND }, 404)
  const input = trimmed(await requestInput(request))
  const { errors } = await validateSchema(mallaSchema({ nameAvailable: async (value) => !(await deps.mallaNameTaken(context.careerId, String(value), mallaId)), updating: true }), input)
  if (errors !== null) return validationError(errors)
  return settle(original, deps, async () => {
    await deps.transaction(async (tx) => {
      const malla = await tx.lockMalla(context.careerId, mallaId)
      if (malla === null) throw new Rejected(apiJson({ message: MALLA_NOT_FOUND }, 404))
      const state = typeof input.state === "string" ? input.state : malla.state
      if (state === "cerrada" && malla.state !== "cerrada" && (await tx.hasOpenPeriodSyllabi(malla.id))) throw invalid("state", MALLA_CLOSING_REFUSED)
      const wanted: [MallaColumn, string | null, string | null][] = [
        ["nombre_malla", "name" in input ? (input.name as string) : malla.name, malla.name],
        ["estado_malla", state, malla.state],
      ]
      const dirty = wanted.filter(([, after, before]) => after !== before)
      if (dirty.length > 0) await tx.updateMalla(malla.id, Object.fromEntries(dirty.map(([column, after]) => [column, after])))
    })
    return apiJson({ message: "Malla actualizada." })
  })
}
