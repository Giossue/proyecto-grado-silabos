import { modelNotFoundResponse } from "../http/failures"
import { fromController } from "../auth/controllerResponse"
import { MODELS } from "../http/models"
import type { Db } from "../../prisma/db"
import { requireSession } from "../auth/requireSession"
import { CURRICULAR_UNITS } from "../academic/structure"
import { jsonError, apiJson, validationError } from "../http/responses"
import { buildIdentification, dataGet } from "../syllabus/identificationCard"
import { phpCompareStrings } from "../syllabus/syllabusDetailQueries"
import { createLogoStore, type LogoStore } from "../shared/logoStore"
import { presentationLogos } from "./institutionalLogos"
import { phpShape, type PhpRecord } from "./phpValues"
import { profileTemplates } from "./subjectProfileFields"
import { defaultSubjectProfileDeps, mayManageSubjectProfile, profileContext, type SubjectProfileDeps } from "./subjectProfile"
import { syllabusSectionPayload, templatePresentationOf, type TemplateField } from "./templatePresentation"
import { TemplateValidationError } from "./templateRuntime"
import { unmatchedRoute, modelNotFound, routeAllows } from "../http/router"

export type SubjectContextRow = {
  id: string
  code: string
  name: string
  cycle: number | null
  position: number | null
  unit: string | null
  credits: string | null
  total_hours: number | null
  hours_ac: string | null
  hours_pae: string | null
  hours_aa: string | null
  career_id: string
  career_code: string
  career_name: string
  cycle_count: number
  faculty_id: string
  faculty: string | null
  faculty_logo: string | null
}

export type SubjectRequirementRow = { code: string }

export type SubjectPreviewDeps = SubjectProfileDeps & {
  subjectContext: (subjectId: string) => Promise<PhpRecord | null>
  logos: LogoStore
}

function requirementCodes(requirements: SubjectRequirementRow[]): string[] {
  return requirements.map((requirement) => requirement.code).sort(phpCompareStrings)
}

export function subjectAcademicContext(subject: SubjectContextRow, requirements: SubjectRequirementRow[]): PhpRecord {
  return {
    schema_version: 6,
    career: {
      id: subject.career_id,
      code: subject.career_code,
      name: subject.career_name,
      faculty: subject.faculty,
      faculty_id: subject.faculty_id,
      faculty_logo: subject.faculty_logo,
    },
    curriculum: { id: subject.career_id, cycle_count: subject.cycle_count },
    subject: {
      id: subject.id,
      code: subject.code,
      name: subject.name,
      cycle: subject.cycle,
      position: subject.position,
      organization_unit: subject.unit === null ? null : (CURRICULAR_UNITS[subject.unit] ?? null),
      credits: subject.credits,
      total_hours: subject.total_hours,
      hours_ac: subject.hours_ac,
      hours_pae: subject.hours_pae,
      hours_aa: subject.hours_aa,
      prerequisites: requirementCodes(requirements),
    },
  }
}

export async function loadSubjectContext(db: Db, subjectId: string): Promise<PhpRecord | null> {
  const [subject] = await db.$queryRaw<SubjectContextRow[]>`select asignatura.asignatura_id::text as id, asignatura.codigo_asignatura as code, asignatura.nombre_asignatura as name,
        asignatura.ciclo_asignatura as cycle, asignatura.orden_asignatura_en_ciclo as position, asignatura.unidad_curricular_asignatura as unit,
        to_char(asignatura.creditos_asignatura, 'FM999999990.00') as credits, asignatura.total_horas_asignatura as total_hours,
        to_char(asignatura.horas_docencia, 'FM999999990.00') as hours_ac, to_char(asignatura.horas_practicas, 'FM999999990.00') as hours_pae,
        to_char(asignatura.horas_autonomas, 'FM999999990.00') as hours_aa,
        carrera.carrera_id::text as career_id, carrera.codigo_carrera as career_code, carrera.nombre_carrera as career_name,
        carrera.numero_ciclos as cycle_count, carrera.facultad_id::text as faculty_id, facultad.nombre_facultad as faculty,
        archivo.hash_archivo as faculty_logo
      from asignaturas asignatura
        inner join carreras carrera on carrera.carrera_id = asignatura.carrera_id
        left join facultades facultad on facultad.facultad_id = carrera.facultad_id
        left join archivos archivo on archivo.archivo_id = facultad.logo_archivo_id
      where asignatura.asignatura_id = ${subjectId}::uuid limit 1`
  if (!subject) return null
  const requirements = await db.$queryRaw<SubjectRequirementRow[]>`select previa.codigo_asignatura as code
      from requisitos_asignatura requisito inner join asignaturas previa on previa.asignatura_id = requisito.requisito_id
      where requisito.asignatura_id = ${subjectId}::uuid`
  return subjectAcademicContext({ ...subject, cycle_count: Number(subject.cycle_count) }, requirements)
}

export function defaultSubjectPreviewDeps(db: Db): SubjectPreviewDeps {
  return {
    ...defaultSubjectProfileDeps(db),
    subjectContext: (subjectId) => loadSubjectContext(db, subjectId),
    logos: createLogoStore(db),
  }
}

export async function previewSubjectProfile(request: Request, subjectId: string, deps: SubjectPreviewDeps): Promise<Response> {
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
  const context = await profileContext(deps.store)
  const academic = await deps.subjectContext(subjectId)
  if (context === null) return fromController(modelNotFoundResponse(MODELS.template))
  if (academic === null) return modelNotFound(MODELS.subject, subjectId)
  const { template, definition } = context
  try {
    const identification = buildIdentification(academic, [], [], [])
    const templates = await profileTemplates(context, subjectId)
    const stored = (field: TemplateField) => templates[field.id] ?? field.content
    return apiJson(
      phpShape({
        presentation: templatePresentationOf(definition, await presentationLogos(request, dataGet(academic, "career.faculty_id"), deps.logos)),
        sections: template.sections.map((section) => syllabusSectionPayload(section, stored, { identification }, definition, templates)),
      }),
    )
  } catch (error) {
    if (error instanceof TemplateValidationError) return validationError(error.errors)
    throw error
  }
}
