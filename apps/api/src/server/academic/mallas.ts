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

export type MallaData = { name: string; resolution: string | null; cycleCount: number; state: string }
export type MallaColumn = "nombre_malla" | "resolucion_malla" | "estado_malla"

export interface MallaTx {
  /** Serializes the vigente switch of a career. */
  lockCareer(careerId: string): Promise<void>
  lockMalla(careerId: string, mallaId: string): Promise<MallaRecord | null>
  /** Turns the career's vigente malla (other than `exceptId`) into en_transicion. */
  demoteVigente(careerId: string, exceptId: string | null): Promise<void>
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

const STATE_ORDER: Record<string, number> = { vigente: 0, en_transicion: 1, cerrada: 2 }

export function sortedMallas(mallas: MallaRecord[]): MallaRecord[] {
  return [...mallas].sort((left, right) => (STATE_ORDER[left.state] ?? 3) - (STATE_ORDER[right.state] ?? 3) || left.name.localeCompare(right.name, "es"))
}

export function mallaPayload(malla: MallaRecord): Record<string, unknown> {
  return { id: malla.id, name: malla.name, resolution: malla.resolution, cycle_count: malla.cycleCount, state: malla.state, subject_count: malla.subjectCount }
}

function text(value: unknown): string | null {
  return typeof value === "string" && phpTrim(value) !== "" ? phpTrim(value) : null
}

function trimmed(input: PhpArray): PhpArray {
  for (const key of ["name", "resolution"]) if (typeof input[key] === "string") input[key] = phpTrim(input[key] as string)
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
  const data: MallaData = { name: input.name as string, resolution: text(input.resolution), cycleCount: phpIntCast(input.cycle_count), state: input.state as string }
  return settle(original, deps, async () => {
    const id = await deps.transaction(async (tx) => {
      await tx.lockCareer(context.careerId)
      if (data.state === "vigente") await tx.demoteVigente(context.careerId, null)
      return tx.insertMalla(context.careerId, data)
    })
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
      if (state === "vigente" && malla.state !== "vigente") {
        await tx.lockCareer(context.careerId)
        await tx.demoteVigente(context.careerId, malla.id)
      }
      const wanted: [MallaColumn, string | null, string | null][] = [
        ["nombre_malla", "name" in input ? (input.name as string) : malla.name, malla.name],
        ["resolucion_malla", "resolution" in input ? text(input.resolution) : malla.resolution, malla.resolution],
        ["estado_malla", state, malla.state],
      ]
      const dirty = wanted.filter(([, after, before]) => after !== before)
      if (dirty.length > 0) await tx.updateMalla(malla.id, Object.fromEntries(dirty.map(([column, after]) => [column, after])))
    })
    return apiJson({ message: "Malla actualizada." })
  })
}
