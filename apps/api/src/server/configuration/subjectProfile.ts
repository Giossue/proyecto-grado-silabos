import { modelNotFoundResponse } from "../http/failures"
import { officialDefinition } from "./officialTemplate"
import { fromController } from "../auth/controllerResponse"
import { MODELS } from "../http/models"
import type { Db } from "../../prisma/db"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, AppSession } from "../auth/types"
import { jsonError, apiJson, validationError } from "../http/responses"
import { phpObject, phpShape } from "./phpValues"
import { TemplateValidationError } from "./templateRuntime"
import { presentDefinition, variableCatalog } from "./templatePresentation"
import { createTemplateStore, type TemplateStore } from "../shared/templateStore"
import { presentedProfileFields, profileComplete, profileFields, profileValues, type ProfileContext } from "./subjectProfileFields"
import { unmatchedRoute, modelNotFound, routeAllows } from "../http/router"
import { CAREER_PROFILE_FINALIZED, CAREER_PROFILE_PAUSE_TO_EDIT } from "@silabos/shared/lib/careerProfileLock"
import { CONVOCATION_OPEN, ROLE_ADMINISTRATOR } from "../syllabus/policy"

const CLOSED = "cerrado"

export type SubjectProfileDeps = {
  bridge: BridgeDeps
  store: TemplateStore
  subjectCareer: (subjectId: string) => Promise<string | null>
  careerActive: (careerId: string) => Promise<boolean>
  careerBlock: (careerId: string) => Promise<string | null>
}

async function subjectCareer(db: Db, subjectId: string): Promise<string | null> {
  const [row] = await db.$queryRaw<{ carrera_id: string }[]>`select carrera_id::text as carrera_id from asignaturas where asignatura_id = ${subjectId}::uuid limit 1`
  return row?.carrera_id ?? null
}

async function careerActive(db: Db, careerId: string): Promise<boolean> {
  const [row] = await db.$queryRaw<{ id: string }[]>`select carrera_id::text as id from carreras where carrera_activa = true and carrera_id = ${careerId}::uuid limit 1`
  return row !== undefined
}

export async function careerProfileBlock(db: Db, careerId: string): Promise<string | null> {
  const [period] = await db.$queryRaw<{ processState: string; convocationState: string | null }[]>`select proceso.estado_convocatoria_universidad as "processState",
      convocatoria.estado_convocatoria_carrera as "convocationState"
    from convocatorias_universidad proceso
    inner join periodos_academicos periodo on periodo.periodo_academico_id = proceso.periodo_academico_id
    left join convocatorias_carreras convocatoria on convocatoria.convocatoria_universidad_id = proceso.convocatoria_universidad_id and convocatoria.carrera_id = ${careerId}::uuid
    order by periodo.fecha_inicio_periodo desc, proceso.convocatoria_universidad_id desc
    limit 1`
  if (period === undefined) return null
  if (period.processState === CLOSED || period.convocationState === CLOSED) return CAREER_PROFILE_FINALIZED
  return period.convocationState === CONVOCATION_OPEN ? CAREER_PROFILE_PAUSE_TO_EDIT : null
}

export async function careerProfileLockReason(session: AppSession, careerId: string, careerBlock: (careerId: string) => Promise<string | null>): Promise<string | null> {
  return session.activeRole?.role === ROLE_ADMINISTRATOR ? null : careerBlock(careerId)
}

export function defaultSubjectProfileDeps(db: Db): SubjectProfileDeps {
  return {
    bridge: defaultBridgeDeps(),
    store: createTemplateStore(db),
    subjectCareer: (subjectId) => subjectCareer(db, subjectId),
    careerActive: (careerId) => careerActive(db, careerId),
    careerBlock: (careerId) => careerProfileBlock(db, careerId),
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
  return subjectProfileResponse(request, subjectId, deps, await careerProfileLockReason(session, careerId, deps.careerBlock))
}

export async function subjectProfileResponse(request: Request, subjectId: string, deps: Pick<SubjectProfileDeps, "bridge" | "store">, lockReason: string | null): Promise<Response> {
  const context = await profileContext(deps.store)
  if (context === null) return fromController(modelNotFoundResponse(MODELS.template))

  try {
    const { definition } = context
    const fields = profileFields(context)
    const values = await profileValues(context, subjectId)
    const fieldIds = new Set(fields.map((field) => field.id))
    const complete = (await profileComplete(context, [subjectId])).get(subjectId) ?? false
    return apiJson(
      phpShape({
        fields: presentedProfileFields(context, fields),
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
