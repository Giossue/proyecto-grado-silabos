import { modelNotFoundResponse } from "../http/failures"
import { officialDefinition } from "./officialTemplate"
import { fromController } from "../auth/controllerResponse"
import { MODELS } from "../http/models"
import type { Db } from "../../prisma/db"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, AppSession } from "../auth/types"
import { jsonError, apiJson, validationError } from "../http/responses"
import { phpObject, phpShape } from "./phpValues"
import { normalizeFieldDocument, responsesEnabled, responseTemplate, TemplateValidationError } from "./templateRuntime"
import { fieldSection, presentDefinition, variableCatalog } from "./templatePresentation"
import { createTemplateStore, type TemplateStore } from "../shared/templateStore"
import { profileComplete, profileFields, profilePositions, profileValues, type ProfileContext } from "./subjectProfileFields"
import { unmatchedRoute, modelNotFound, routeAllows } from "../http/router"
import { CONVOCATION_PAUSED, PROCESS_PAUSED, ROLE_ADMINISTRATOR } from "../syllabus/policy"

export const CAREER_PROFILE_BLOCKED = "El proyecto de carrera no se puede editar con el periodo académico en pausa o finalizado."
const CLOSED = "cerrado"

export type SubjectProfileDeps = {
  bridge: BridgeDeps
  store: TemplateStore
  subjectCareer: (subjectId: string) => Promise<string | null>
  careerActive: (careerId: string) => Promise<boolean>
  careerEditable: (careerId: string) => Promise<boolean>
}

async function subjectCareer(db: Db, subjectId: string): Promise<string | null> {
  const [row] = await db.$queryRaw<{ carrera_id: string }[]>`select carrera_id::text as carrera_id from asignaturas where asignatura_id = ${subjectId}::uuid limit 1`
  return row?.carrera_id ?? null
}

async function careerActive(db: Db, careerId: string): Promise<boolean> {
  const [row] = await db.$queryRaw<{ id: string }[]>`select carrera_id::text as id from carreras where carrera_activa = true and carrera_id = ${careerId}::uuid limit 1`
  return row !== undefined
}

export async function careerProfileEditable(db: Db, careerId: string): Promise<boolean> {
  const [period] = await db.$queryRaw<{ processState: string; convocationState: string | null }[]>`select proceso.estado_convocatoria_universidad as "processState",
      convocatoria.estado_convocatoria_carrera as "convocationState"
    from convocatorias_universidad proceso
    inner join periodos_academicos periodo on periodo.periodo_academico_id = proceso.periodo_academico_id
    left join convocatorias_carreras convocatoria on convocatoria.convocatoria_universidad_id = proceso.convocatoria_universidad_id and convocatoria.carrera_id = ${careerId}::uuid
    order by periodo.fecha_inicio_periodo desc, proceso.convocatoria_universidad_id desc
    limit 1`
  if (period === undefined) return true
  if (period.processState === PROCESS_PAUSED || period.processState === CLOSED) return false
  return period.convocationState !== CONVOCATION_PAUSED && period.convocationState !== CLOSED
}

export async function careerProfileLockReason(session: AppSession, careerId: string, careerEditable: (careerId: string) => Promise<boolean>): Promise<string | null> {
  if (session.activeRole?.role === ROLE_ADMINISTRATOR) return null
  return (await careerEditable(careerId)) ? null : CAREER_PROFILE_BLOCKED
}

export function defaultSubjectProfileDeps(db: Db): SubjectProfileDeps {
  return {
    bridge: defaultBridgeDeps(),
    store: createTemplateStore(db),
    subjectCareer: (subjectId) => subjectCareer(db, subjectId),
    careerActive: (careerId) => careerActive(db, careerId),
    careerEditable: (careerId) => careerProfileEditable(db, careerId),
  }
}

export async function mayManageSubjectProfile(session: AppSession, careerId: string, careerActive: (careerId: string) => Promise<boolean>): Promise<boolean> {
  const role = session.activeRole
  if (!session.user.active || role === null) return false
  if (role.role === "administrador") return true
  return role.role === "coordinador" && role.careerId !== null && (await careerActive(role.careerId)) && role.careerId === careerId
}

export async function writableProfileContext(store: TemplateStore): Promise<ProfileContext> {
  const context = await profileContext(store)
  if (context !== null) return context
  const definition = officialDefinition()
  return { template: { id: "", modifiedAt: null, definition, sections: [] }, definition, store }
}

export async function profileContext(store: TemplateStore): Promise<ProfileContext | null> {
  const template = await store.template()
  if (template === null) return null
  return { template, definition: template.definition, store }
}

export async function showSubjectProfile(request: Request, subjectId: string, deps: SubjectProfileDeps): Promise<Response> {
  if (!routeAllows(request)) return unmatchedRoute(request)
  let careerId: string | null = null
  const session = await requireSession(
    request,
    {
      verified: true,
      activeRole: "required",
      afterAuthentication: async () => {
        careerId = await deps.subjectCareer(subjectId)
        return careerId === null ? modelNotFound(MODELS.subject, subjectId) : null
      },
    },
    deps.bridge,
  )
  if (session instanceof Response) return session
  if (careerId === null || !(await mayManageSubjectProfile(session, careerId, deps.careerActive))) return jsonError(403, "")
  return subjectProfileResponse(request, subjectId, deps, await careerProfileLockReason(session, careerId, deps.careerEditable))
}

export async function subjectProfileResponse(request: Request, subjectId: string, deps: Pick<SubjectProfileDeps, "bridge" | "store">, lockReason: string | null): Promise<Response> {
  const context = await profileContext(deps.store)
  if (context === null) return fromController(modelNotFoundResponse(MODELS.template))

  try {
    const { template, definition } = context
    const fields = profileFields(context)
    const positions = profilePositions(context)
    const values = await profileValues(context, subjectId)
    const fieldIds = new Set(fields.map((field) => field.id))
    const complete = (await profileComplete(context, [subjectId])).get(subjectId) ?? false
    return apiJson(
      phpShape({
        fields: fields.map((field) => ({
          id: field.id,
          key: field.key,
          label: field.label,
          quien_llena: field.responsible,
          content: field.content,
          ...(responsesEnabled(definition) ? { template: responseTemplate(normalizeFieldDocument(field.content, definition)) } : {}),
          section: fieldSection(template, field)?.title ?? null,
          position: positions.get(field.id) ?? 0,
        })),
        values: phpObject(Object.fromEntries([...values].filter(([id]) => fieldIds.has(id)))),
        complete,
        definition: presentDefinition(definition),
        variables: phpObject(Object.fromEntries(variableCatalog(definition).map((item) => [item.key, item.sample]))),
        lock_reason: lockReason,
      }),
    )
  } catch (error) {
    if (error instanceof TemplateValidationError) return validationError(error.errors)
    throw error
  }
}
