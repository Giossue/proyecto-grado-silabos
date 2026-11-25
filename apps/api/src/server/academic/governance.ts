import { aborted } from "../http/responses"
import { fromController } from "../auth/controllerResponse"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps } from "../auth/types"
import { apiJson } from "../http/responses"
import { configuredFacultyUrl, type StoredLogo } from "../configuration/institutionalLogos"
import { institutionToday } from "../dashboard/dashboardQueries"
import { baseOptions, CONVOCATION_LOCK_REASON, forbidden } from "./structure"
import { createGovernanceRepository } from "./governanceQueries"

export type GovernanceProcess = { id: string; periodId: string; state: string }
export type GovernanceFaculty = { id: string; name: string; campus: string; libraries: unknown; active: boolean; logo: StoredLogo | null }
export type GovernanceCareer = {
  id: string
  facultyId: string
  coordinator: { id: string; name: string } | null
  modality: string | null
  campus: string | null
  code: string
  name: string
  active: boolean
}
export type GovernancePeriod = { id: string; code: string; startsOn: string; endsOn: string; teachingWeeks: number | null }
export type CareerRoleCount = { careerId: string; role: string; total: number }

export interface GovernanceRepository {
  processes(): Promise<GovernanceProcess[]>
  faculties(): Promise<GovernanceFaculty[]>
  careers(): Promise<GovernanceCareer[]>
  periods(): Promise<GovernancePeriod[]>
  facultiesWithActiveCareers(facultyIds: string[]): Promise<string[]>
  careersInRunningConvocation(careerIds: string[]): Promise<string[]>
  careerRoleCounts(careerIds: string[]): Promise<CareerRoleCount[]>
}

export type GovernanceDeps = { bridge: BridgeDeps; governance: GovernanceRepository; today: () => string }

const SECTIONS: Record<string, string> = { facultades: "faculties", carreras: "careers", "periodos-academicos": "academic-periods" }
const CLOSED_CONVOCATION_LOCK_REASON = "Convocatoria cerrada"
const PROCESS_CLOSED = "cerrado"
const IN_PROGRESS = ["abierto", "pausado"]
const FACULTY_BLOCK = "Desactive primero las carreras activas de esta facultad."
const CAREER_BLOCK = "La carrera participa en una convocatoria en curso. Espere a que se cierre."
const CAMPUS_LOCATIONS = [
  "Campus Matriz Dr. Gabriel Galarza López",
  "Campus Laguacoto",
  "Campus CENI (Centro de Eventos Nacionales e Internacionales)",
  "Extensión San Miguel",
  "Sede Chimbo",
]

function defaultDeps(): GovernanceDeps {
  return { bridge: defaultBridgeDeps(), governance: createGovernanceRepository(), today: institutionToday }
}

function periodStatus(period: GovernancePeriod, today: string): { status: string; label: string } {
  if (period.endsOn < today) return { status: "finalizado", label: "Finalizado" }
  return period.startsOn > today ? { status: "proximo", label: "Próximo" } : { status: "en_curso", label: "En curso" }
}

function campusOptions(): { value: string; label: string }[] {
  return CAMPUS_LOCATIONS.map((value) => ({ value, label: value }))
}

async function governancePayload(request: Request, deps: GovernanceDeps): Promise<Record<string, unknown>> {
  const repository = deps.governance
  const today = deps.today()
  const processes = await repository.processes()
  const processesByPeriod = new Map<string, GovernanceProcess>()
  const lockedPeriods = new Map<string, string>()
  for (const process of processes) {
    processesByPeriod.set(process.periodId, process)
    lockedPeriods.set(process.periodId, process.state === PROCESS_CLOSED ? CLOSED_CONVOCATION_LOCK_REASON : CONVOCATION_LOCK_REASON)
  }
  const faculties = await repository.faculties()
  const careers = await repository.careers()
  const activeFacultyIds = faculties.filter((faculty) => faculty.active).map((faculty) => faculty.id)
  const activeCareerIds = careers.filter((career) => career.active).map((career) => career.id)
  const facultyBlocks = new Set(activeFacultyIds.length === 0 ? [] : await repository.facultiesWithActiveCareers(activeFacultyIds))
  const careerBlocks = new Set(activeCareerIds.length === 0 ? [] : await repository.careersInRunningConvocation(activeCareerIds))
  const careerUsers = new Map<string, { coordinators: number; teachers: number }>()
  for (const row of await repository.careerRoleCounts(activeCareerIds)) {
    const counts = careerUsers.get(row.careerId) ?? { coordinators: 0, teachers: 0 }
    if (row.role === "coordinador") counts.coordinators += row.total
    else counts.teachers += row.total
    careerUsers.set(row.careerId, counts)
  }
  const periods = await repository.periods()
  const [firstLock] = lockedPeriods.values()
  return {
    lock_reason: firstLock ?? null,
    convocation_in_progress: processes.some((process) => IN_PROGRESS.includes(process.state)),
    catalogs: {
      faculties: await Promise.all(
        faculties.map(async (faculty) => ({
          id: faculty.id,
          nombre: faculty.name,
          campus: faculty.campus,
          catalog_libraries: faculty.libraries,
          activo: faculty.active,
          deactivate_block: facultyBlocks.has(faculty.id) ? FACULTY_BLOCK : null,
          lock_reason: null,
          logo_url: await configuredFacultyUrl(request, { id: faculty.id, logo: faculty.logo }),
        })),
      ),
      careers: careers.map((career) => ({
        id: career.id,
        faculty_id: career.facultyId,
        coordinator: career.coordinator,
        modality: career.modality,
        modality_label: career.modality,
        campus_name: career.campus,
        code: career.code,
        name: career.name,
        active: career.active,
        deactivate_block: careerBlocks.has(career.id) ? CAREER_BLOCK : null,
        deactivate_users: careerUsers.get(career.id) ?? { coordinators: 0, teachers: 0 },
        lock_reason: null,
      })),
      periods: periods.map((period) => {
        const process = processesByPeriod.get(period.id)
        const { status, label } = periodStatus(period, today)
        return {
          id: period.id,
          code: period.code,
          starts_on: period.startsOn,
          ends_on: period.endsOn,
          teaching_weeks: period.teachingWeeks,
          status,
          status_label: label,
          institutional_process: process === undefined ? null : { id: process.id, state: process.state },
          lock_reason: lockedPeriods.get(period.id) ?? null,
        }
      }),
    },
    options: {
      ...baseOptions(),
      faculties: faculties.filter((faculty) => faculty.active).map((faculty) => ({ id: faculty.id, nombre: faculty.name })),
      campusOptions: campusOptions(),
    },
  }
}

export async function academicGovernance(request: Request, section: string | null, deps: GovernanceDeps = defaultDeps()): Promise<Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  if (!session.user.active || session.activeRole?.role !== "administrador") return forbidden()
  const resolved = section === null ? "faculties" : SECTIONS[section]
  if (resolved === undefined) return fromController(aborted(404))
  return apiJson({ ...(await governancePayload(request, deps)), section: resolved })
}
