import { Inject, Injectable } from "@nestjs/common"
import { Prisma } from "../../generated/prisma/client"
import { PrismaService } from "../../prisma/prisma.service"
import { uuid7 } from "../../server/http/uuid7"
import type { ProcessRepository, ProcessRow, ProcessTx } from "../../server/syllabus/processes"

export const PROCESS_TRANSACTION = { maxWait: 10_000, timeout: 600_000 }

const institutionTimezone = () => process.env.DISPLAY_TIMEZONE ?? "America/Guayaquil"

export const dateOnly = (value: Date) => value.toISOString().slice(0, 10)

function processRows(where: Prisma.Sql, tail: Prisma.Sql = Prisma.empty): Prisma.Sql {
  const timezone = institutionTimezone()
  return Prisma.sql`select cu.convocatoria_universidad_id::text as "id", cu.estado_convocatoria_universidad as "state", p.codigo_periodo_academico as "period",
      cu.periodo_academico_id::text as "periodId", to_char(p.fecha_fin_periodo, 'YYYY-MM-DD') as "periodEndsOn",
      to_char(cu.fecha_inicio at time zone ${timezone}, 'YYYY-MM-DD') as "startsOn", to_char(cu.fecha_entrega at time zone ${timezone}, 'YYYY-MM-DD') as "dueOn",
      (select count(*) from convocatorias_carreras where cu.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id
        and exists (select 1 from convocatorias_universidad vigente where vigente.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id))::int as "convocationsCount",
      cu.cantidad_prorrogas as "extensions"
    from convocatorias_universidad cu inner join periodos_academicos p on p.periodo_academico_id = cu.periodo_academico_id
    ${where} ${tail}`
}

export function processTxOn(tx: Prisma.TransactionClient): ProcessTx {
  return {
    async lockProcess(id) {
      const [row] = await tx.$queryRaw<{ state: string }[]>`select estado_convocatoria_universidad as "state" from convocatorias_universidad
        where convocatoria_universidad_id = ${id}::uuid limit 1 for update`
      return row?.state ?? null
    },
    async pause(id) {
      await tx.convocatorias_universidad.updateMany({ where: { convocatoria_universidad_id: id }, data: { estado_convocatoria_universidad: "pausado" } })
      await tx.$executeRaw`update convocatorias_universidad set pausado_en = clock_timestamp() where convocatoria_universidad_id = ${id}::uuid`
    },
    async lockInProgress() {
      const [row] = await tx.$queryRaw<{ id: string; periodId: string }[]>`select convocatoria_universidad_id::text as "id", periodo_academico_id::text as "periodId"
        from convocatorias_universidad where estado_convocatoria_universidad in ('abierto', 'pausado') limit 1 for update`
      if (!row) return null
      const period = await tx.periodos_academicos.findFirst({ where: { periodo_academico_id: row.periodId }, select: { codigo_periodo_academico: true } })
      return { id: row.id, period: period?.codigo_periodo_academico ?? null }
    },
    async periodHasProcess(periodId) {
      return (await tx.convocatorias_universidad.findFirst({ where: { periodo_academico_id: periodId }, select: { convocatoria_universidad_id: true } })) !== null
    },
    async createProcess(periodId, startsAt, dueAt) {
      const id = uuid7()
      await tx.convocatorias_universidad.createMany({
        data: [{ periodo_academico_id: periodId, fecha_inicio: new Date(startsAt), fecha_entrega: new Date(dueAt), estado_convocatoria_universidad: "abierto", convocatoria_universidad_id: id }],
      })
      return id
    },
  }
}

@Injectable()
export class ProcessesRepository implements ProcessRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  list(): Promise<ProcessRow[]> {
    return this.prisma.$queryRaw<ProcessRow[]>(processRows(Prisma.empty, Prisma.sql`order by cu.fecha_inicio desc`))
  }

  async templateHasFields(templateId: string): Promise<boolean> {
    return (await this.prisma.definiciones_campo.findFirst({ where: { plantilla_id: templateId, vigente_en_plantilla: true }, select: { definicion_campo_id: true } })) !== null
  }

  async periods(): Promise<{ id: string; codigo: string }[]> {
    const rows = await this.prisma.periodos_academicos.findMany({ orderBy: { fecha_inicio_periodo: "desc" }, select: { periodo_academico_id: true, codigo_periodo_academico: true } })
    return rows.map((row) => ({ id: row.periodo_academico_id, codigo: row.codigo_periodo_academico }))
  }

  async find(id: string): Promise<ProcessRow | null> {
    const [row] = await this.prisma.$queryRaw<ProcessRow[]>(processRows(Prisma.sql`where cu.convocatoria_universidad_id = ${id}::uuid`, Prisma.sql`limit 1`))
    return row ?? null
  }

  async counts(processId: string): Promise<{ state: string; total: number }[]> {
    const rows = await this.prisma.silabos.groupBy({ by: ["estado_silabo"], where: { convocatorias_carreras: { is: { convocatoria_universidad_id: processId } } }, _count: { _all: true } })
    return rows.map((row) => ({ state: row.estado_silabo, total: row._count._all }))
  }

  async periodEndsOn(periodId: string): Promise<string | null> {
    const row = await this.prisma.periodos_academicos.findFirst({ where: { periodo_academico_id: periodId }, select: { fecha_fin_periodo: true } })
    return row ? dateOnly(row.fecha_fin_periodo) : null
  }

  activeCareerCount(): Promise<number> {
    return this.prisma.carreras.count({ where: { carrera_activa: true } })
  }

  activeCareersWithoutCoordinator(): Promise<number> {
    return this.prisma.carreras.count({ where: { carrera_activa: true, asignaciones_rol: { none: { rol: "coordinador", asignacion_rol_activa: true } } } })
  }

  transaction<T>(work: (tx: ProcessTx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => work(processTxOn(tx)), PROCESS_TRANSACTION)
  }
}
