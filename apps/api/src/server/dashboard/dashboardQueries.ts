import { Prisma } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"
import { epochText } from "../../prisma/sql"
import { libraryReviewCounts } from "../library/reviewQueries"
import { institutionTimezone } from "../shared/clock"
import type { ConvocationRecord, DashboardRepository, ProcessRecord, TeacherSyllabus } from "./dashboard"

const localDate = (column: string) => Prisma.sql`to_char(${Prisma.raw(column)} at time zone ${institutionTimezone()}, 'YYYY-MM-DD')`

const PROCESS = () => Prisma.sql`convocatorias_universidad.convocatoria_universidad_id::text as id, convocatorias_universidad.estado_convocatoria_universidad as state,
  periodos_academicos.codigo_periodo_academico as period, ${localDate("convocatorias_universidad.fecha_inicio")} as "startsOn",
  ${localDate("convocatorias_universidad.fecha_entrega")} as "dueOn", to_char(periodos_academicos.fecha_fin_periodo, 'YYYY-MM-DD') as "periodEndsOn"`

const PROCESS_FROM = Prisma.sql`from convocatorias_universidad
  inner join periodos_academicos on periodos_academicos.periodo_academico_id = convocatorias_universidad.periodo_academico_id`

const CONVOCATION = Prisma.sql`convocatorias_carreras.convocatoria_carrera_id::text as id, convocatorias_carreras.estado_convocatoria_carrera as state`
const IN_PROGRESS = Prisma.sql`convocatorias_universidad.estado_convocatoria_universidad in ('abierto', 'pausado')`

function currentTeacher(userId: string): Prisma.Sql {
  return Prisma.sql`exists (select docentes_vigentes_silabo.silabo_id from docentes_vigentes_silabo
    inner join usuarios on usuarios.usuario_id = docentes_vigentes_silabo.usuario_id
    where docentes_vigentes_silabo.silabo_id = silabos.silabo_id and docentes_vigentes_silabo.usuario_id = ${userId}::uuid and usuarios.usuario_activo = true)`
}

function careerOf(careerId: string | null): Prisma.Sql {
  return careerId === null ? Prisma.empty : Prisma.sql`and convocatorias_carreras.carrera_id = ${careerId}::uuid`
}

async function inProgressProcess(db: Db): Promise<ProcessRecord | null> {
  const [row] = await db.$queryRaw<ProcessRecord[]>`select ${PROCESS()} ${PROCESS_FROM} where ${IN_PROGRESS} limit 1`
  return row ?? null
}

type TeacherRow = ProcessRecord & { convocationId: string; convocationState: string; dueEpoch: string }

export function createDashboardRepository(db: Db): DashboardRepository {
  return {
    inProgressProcess: () => inProgressProcess(db),
    async latestProcess() {
      const current = await inProgressProcess(db)
      if (current !== null) return current
      const [row] = await db.$queryRaw<ProcessRecord[]>`select ${PROCESS()} ${PROCESS_FROM} order by periodos_academicos.fecha_inicio_periodo desc limit 1`
      return row ?? null
    },
    async convocation(careerId, processId): Promise<ConvocationRecord | null> {
      const [row] = await db.$queryRaw<ConvocationRecord[]>`select ${CONVOCATION} from convocatorias_carreras
        where convocatorias_carreras.carrera_id = ${careerId}::uuid and convocatorias_carreras.convocatoria_universidad_id = ${processId}::uuid
          and exists (select convocatorias_universidad.convocatoria_universidad_id from convocatorias_universidad
            where convocatorias_universidad.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id)
        limit 1`
      return row ?? null
    },
    async teacherOpenSyllabi(userId, careerId): Promise<TeacherSyllabus[]> {
      const found = await db.$queryRaw<TeacherRow[]>`select ${PROCESS()}, convocatorias_carreras.convocatoria_carrera_id::text as "convocationId",
          convocatorias_carreras.estado_convocatoria_carrera as "convocationState", ${epochText(Prisma.raw("convocatorias_universidad.fecha_entrega"))} as "dueEpoch"
        from silabos
          inner join convocatorias_carreras on convocatorias_carreras.convocatoria_carrera_id = silabos.convocatoria_carrera_id
          inner join convocatorias_universidad on convocatorias_universidad.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id
          inner join periodos_academicos on periodos_academicos.periodo_academico_id = convocatorias_universidad.periodo_academico_id
        where silabos.estado_silabo <> 'aprobado' and ${currentTeacher(userId)} ${careerOf(careerId)} and ${IN_PROGRESS}`
      return found.map((row) => ({
        convocation: { id: row.convocationId, state: row.convocationState },
        process: { id: row.id, state: row.state, period: row.period, startsOn: row.startsOn, dueOn: row.dueOn, periodEndsOn: row.periodEndsOn },
        dueAt: Number(row.dueEpoch),
      }))
    },
    async finalizedTeacherConvocation(userId, processId, careerId): Promise<ConvocationRecord | null> {
      const [row] = await db.$queryRaw<ConvocationRecord[]>`select ${CONVOCATION}
        from silabos
          inner join convocatorias_carreras on convocatorias_carreras.convocatoria_carrera_id = silabos.convocatoria_carrera_id
          inner join convocatorias_universidad on convocatorias_universidad.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id
        where ${currentTeacher(userId)} and convocatorias_carreras.convocatoria_universidad_id = ${processId}::uuid ${careerOf(careerId)}
        limit 1`
      return row ?? null
    },
    libraryCounts: () => libraryReviewCounts(db),
  }
}
