import { Inject, Injectable } from "@nestjs/common"
import { PrismaService } from "../../prisma/prisma.service"
import type { TemplateLock, TemplateLockStore } from "../../server/configuration/templateBuilder"

const institutionTimezone = () => process.env.DISPLAY_TIMEZONE ?? "America/Guayaquil"

@Injectable()
export class TemplateLocksRepository implements TemplateLockStore {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async processLock(): Promise<TemplateLock | null> {
    const [row] = await this.prisma.$queryRaw<{ period: string | null; deliveryOn: string }[]>`
      select p.codigo_periodo_academico as period, to_char(cu.fecha_entrega at time zone ${institutionTimezone()}, 'YYYY-MM-DD') as "deliveryOn"
      from convocatorias_universidad cu
      left join periodos_academicos p on p.periodo_academico_id = cu.periodo_academico_id
      where cu.estado_convocatoria_universidad = 'abierto'
      limit 1`
    return row === undefined ? null : { period: row.period, deliveryOn: String(row.deliveryOn) }
  }

  async changedDuringPause(templateId: string): Promise<boolean> {
    const [row] = await this.prisma.$queryRaw<{ changed: boolean }[]>`select coalesce(
        (select plantilla_modificada_en from plantilla_silabo where plantilla_id = ${templateId}::uuid)
          > (select pausado_en from convocatorias_universidad where estado_convocatoria_universidad = 'pausado' limit 1),
        false) as changed`
    return row?.changed === true
  }
}
