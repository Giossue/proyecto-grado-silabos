import type { RoleAssignmentRecord } from "../auth/types"

export type DestinationLookups = {
  processCareerIds(processId: string): Promise<string[]>
  convocationCareerIds(convocationId: string): Promise<string[]>
  syllabusExists(syllabusId: string): Promise<boolean>
  syllabusCareerId(syllabusId: string): Promise<string | null>
  latestRevisionId(syllabusId: string): Promise<string | null>
  teacherAssignmentIds(syllabusId: string, userId: string): Promise<string[]>
  artifactRevision(artifactId: string): Promise<{ revisionId: string; syllabusId: string } | null>
}

export type DestinationNotice = { type: string; resourceType: string | null; resourceId: string | null }

export type Destination = { assignment: RoleAssignmentRecord | null; path: string }

const COORDINATOR = "coordinador"
const TEACHER = "docente"
const LIBRARIAN = "bibliotecario"

const COORDINATION_EVENTS = ["biblioteca.verificado", "biblioteca.aprobado", "biblioteca.correccion_solicitada"]
const LIBRARY_EVENTS = ["silabo.enviado", "silabo.reenviado_biblioteca", "coordinacion.aprobado"]
const PROCESS_STAFF_EVENTS = ["proceso.reanudado"]
const PROCESS_TEACHER_EVENTS = ["proceso.plantilla_rehecho", "proceso.plazo_extendido"]
const TEACHER_EVENTS = [
  "convocatoria.abierta",
  "convocatoria.reanudada",
  "silabo.correccion_solicitada",
  "silabo.devuelto_borrador",
  "silabo.eliminado",
  "silabo.regenerado",
  "silabo.aprobado",
]

function withRole(eligible: RoleAssignmentRecord[], role: string, careerIds: string[] | null, path: string): Destination[] {
  return eligible
    .filter((assignment) => assignment.role === role && (careerIds === null || (assignment.careerId !== null && careerIds.includes(assignment.careerId))))
    .map((assignment) => ({ assignment, path }))
}

function preferActive(options: Destination[], active: RoleAssignmentRecord | null): Destination | null {
  if (active !== null) {
    const preferred = options.find((option) => option.assignment?.id === active.id)
    if (preferred) return preferred
  }
  return options[0] ?? null
}

async function teacherOptions(
  syllabusId: string,
  userId: string,
  eligible: RoleAssignmentRecord[],
  path: string,
  lookups: DestinationLookups,
): Promise<Destination[]> {
  const assignmentIds = await lookups.teacherAssignmentIds(syllabusId, userId)
  return eligible.filter((assignment) => assignmentIds.includes(assignment.id)).map((assignment) => ({ assignment, path }))
}

async function syllabusOptions(
  syllabusId: string,
  notice: DestinationNotice,
  userId: string,
  eligible: RoleAssignmentRecord[],
  lookups: DestinationLookups,
): Promise<Destination[]> {
  if (!(await lookups.syllabusExists(syllabusId))) return []
  const careerId = await lookups.syllabusCareerId(syllabusId)
  const revision = await lookups.latestRevisionId(syllabusId)
  if (LIBRARY_EVENTS.includes(notice.type)) {
    return withRole(eligible, LIBRARIAN, null, revision !== null ? `/biblioteca/revisiones/${revision}` : "/biblioteca/revisiones")
  }
  const teacher = await teacherOptions(syllabusId, userId, eligible, `/docente/mis-silabos/${syllabusId}`, lookups)
  const coordinator = withRole(
    eligible,
    COORDINATOR,
    careerId !== null ? [careerId] : [],
    revision !== null ? `/coordinacion/revisiones/${revision}` : "/coordinacion/revisiones",
  )
  return COORDINATION_EVENTS.includes(notice.type) ? [...coordinator, ...teacher] : [...teacher, ...coordinator]
}

async function artifactOptions(artifactId: string, userId: string, eligible: RoleAssignmentRecord[], lookups: DestinationLookups): Promise<Destination[]> {
  const target = await lookups.artifactRevision(artifactId)
  if (target === null) return []
  const careerId = await lookups.syllabusCareerId(target.syllabusId)
  return [
    ...(await teacherOptions(target.syllabusId, userId, eligible, `/docente/revisiones/${target.revisionId}/documentos`, lookups)),
    ...withRole(eligible, COORDINATOR, careerId !== null ? [careerId] : [], `/coordinacion/revisiones/${target.revisionId}/documentos`),
  ]
}

function careerOptions(careers: string[], eligible: RoleAssignmentRecord[]): Destination[] {
  return [...withRole(eligible, TEACHER, careers, "/docente/mis-silabos"), ...withRole(eligible, COORDINATOR, careers, "/coordinacion/revisiones")]
}

async function options(notice: DestinationNotice, userId: string, eligible: RoleAssignmentRecord[], lookups: DestinationLookups): Promise<Destination[]> {
  const id = notice.resourceId
  if (id === null) return []
  switch (notice.resourceType) {
    case "silabo":
      return syllabusOptions(id, notice, userId, eligible, lookups)
    case "artefacto_exportacion":
      return artifactOptions(id, userId, eligible, lookups)
    case "convocatoria":
      return careerOptions(await lookups.convocationCareerIds(id), eligible)
    case "proceso_silabos":
      return careerOptions(await lookups.processCareerIds(id), eligible)
    case "carrera":
      return withRole(eligible, TEACHER, [id], "/docente/mis-silabos")
    default:
      return []
  }
}

export async function resolveDestination(
  notice: DestinationNotice,
  userId: string,
  active: RoleAssignmentRecord | null,
  eligible: RoleAssignmentRecord[],
  lookups: DestinationLookups,
): Promise<Destination | null> {
  if (notice.resourceType === "proceso_silabos" && notice.resourceId !== null) {
    const careers = await lookups.processCareerIds(notice.resourceId)
    if (PROCESS_TEACHER_EVENTS.includes(notice.type)) {
      return withRole(eligible, TEACHER, careers, "/docente/mis-silabos")[0] ?? null
    }
    if (PROCESS_STAFF_EVENTS.includes(notice.type)) {
      return preferActive(
        [...withRole(eligible, COORDINATOR, careers, "/coordinacion/revisiones"), ...withRole(eligible, LIBRARIAN, null, "/biblioteca/revisiones")],
        active,
      )
    }
  }
  let found = await options(notice, userId, eligible, lookups)
  if (TEACHER_EVENTS.includes(notice.type)) {
    found = found.filter((option) => option.assignment?.role === TEACHER)
  }
  return preferActive(found, active)
}

export function contextLabel(assignment: RoleAssignmentRecord | null): string | null {
  if (assignment === null) return null
  const career = assignment.careerLabel
  const suffix = career !== null ? ` · ${career}` : ""
  switch (assignment.role) {
    case COORDINATOR:
      return `Coordinación${suffix}`
    case TEACHER:
      return `Docencia${suffix}`
    case LIBRARIAN:
      return "Biblioteca"
    default:
      return "Administración"
  }
}
