import { Inject, Injectable } from "@nestjs/common"
import { Prisma } from "../../generated/prisma/client"
import { PrismaService } from "../../prisma/prisma.service"
import type { ConvocationRecord, DashboardRepository, ProcessRecord, TeacherSyllabus } from "../../server/dashboard/dashboard"
import { LIBRARY_COUNTS } from "./dashboard.tokens"

const institutionTimezone = () => process.env.DISPLAY_TIMEZONE ?? "America/Guayaquil"
const IN_PROGRESS = Prisma.sql`cu.estado_convocatoria_universidad in ('abierto', 'pausado')`

function processColumns(): Prisma.Sql {
  const timezone = institutionTimezone()
  return Prisma.sql`cu.convocatoria_universidad_id::text as "id", cu.estado_convocatoria_universidad as "state", p.codigo_periodo_academico as "period",
    to_char(cu.fecha_inicio at time zone ${timezone}, 'YYYY-MM-DD') as "startsOn", to_char(cu.fecha_entrega at time zone ${timezone}, 'YYYY-MM-DD') as "dueOn",
    to_char(p.fecha_fin_periodo, 'YYYY-MM-DD') as "periodEndsOn"`
}

const PROCESS_FROM = Prisma.sql`from convocatorias_universidad cu inner join periodos_academicos p on p.periodo_academico_id = cu.periodo_academico_id`

function currentTeacher(userId: string): Prisma.Sql {
  return Prisma.sql`exists (select 1 from docentes_vigentes_silabo d inner join usuarios u on u.usuario_id = d.usuario_id
    where d.silabo_id = s.silabo_id and d.usuario_id = ${userId}::uuid and u.usuario_activo = true)`
}

const careerOf = (careerId: string | null) => (careerId === null ? Prisma.empty : Prisma.sql`and cc.carrera_id = ${careerId}::uuid`)

type TeacherRow = ProcessRecord & { convocationId: string; convocationState: string; dueEpoch: string }

@Injectable()
export class PrismaDashboardRepository implements DashboardRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LIBRARY_COUNTS) readonly libraryCounts: () => Promise<Record<string, number>>,
  ) {}

  async inProgressProcess(): Promise<ProcessRecord | null> {
    const [row] = await this.prisma.$queryRaw<ProcessRecord[]>`select ${processColumns()} ${PROCESS_FROM} where ${IN_PROGRESS} limit 1`
    return row ?? null
  }

  async latestProcess(): Promise<ProcessRecord | null> {
    const current = await this.inProgressProcess()
    if (current !== null) return current
    const [row] = await this.prisma.$queryRaw<ProcessRecord[]>`select ${processColumns()} ${PROCESS_FROM} order by p.fecha_inicio_periodo desc limit 1`
    return row ?? null
  }

  async convocation(careerId: string, processId: string): Promise<ConvocationRecord | null> {
    const row = await this.prisma.convocatorias_carreras.findFirst({
      where: { carrera_id: careerId, convocatoria_universidad_id: processId, convocatorias_universidad: { is: {} } },
      select: { convocatoria_carrera_id: true, estado_convocatoria_carrera: true },
    })
    return row ? { id: row.convocatoria_carrera_id, state: row.estado_convocatoria_carrera } : null
  }

  async teacherOpenSyllabi(userId: string, careerId: string | null): Promise<TeacherSyllabus[]> {
    const rows = await this.prisma.$queryRaw<TeacherRow[]>`select ${processColumns()}, cc.convocatoria_carrera_id::text as "convocationId", cc.estado_convocatoria_carrera as "convocationState",
        extract(epoch from cu.fecha_entrega)::bigint::text as "dueEpoch"
      from silabos s
        inner join convocatorias_carreras cc on cc.convocatoria_carrera_id = s.convocatoria_carrera_id
        inner join convocatorias_universidad cu on cu.convocatoria_universidad_id = cc.convocatoria_universidad_id
        inner join periodos_academicos p on p.periodo_academico_id = cu.periodo_academico_id
      where s.estado_silabo <> 'aprobado' and ${currentTeacher(userId)} ${careerOf(careerId)} and ${IN_PROGRESS}`
    return rows.map((row) => ({
      convocation: { id: row.convocationId, state: row.convocationState },
      process: { id: row.id, state: row.state, period: row.period, startsOn: row.startsOn, dueOn: row.dueOn, periodEndsOn: row.periodEndsOn },
      dueAt: Number(row.dueEpoch),
    }))
  }

  async finalizedTeacherConvocation(userId: string, processId: string, careerId: string | null): Promise<ConvocationRecord | null> {
    const [row] = await this.prisma.$queryRaw<ConvocationRecord[]>`select cc.convocatoria_carrera_id::text as "id", cc.estado_convocatoria_carrera as "state"
      from silabos s
        inner join convocatorias_carreras cc on cc.convocatoria_carrera_id = s.convocatoria_carrera_id
        inner join convocatorias_universidad cu on cu.convocatoria_universidad_id = cc.convocatoria_universidad_id
      where ${currentTeacher(userId)} and cc.convocatoria_universidad_id = ${processId}::uuid ${careerOf(careerId)}
      limit 1`
    return row ?? null
  }
}
