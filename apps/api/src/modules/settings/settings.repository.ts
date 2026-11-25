import { Inject, Injectable } from "@nestjs/common"
import { PrismaService } from "../../prisma/prisma.service"
import type { SettingRow } from "../../server/operations/systemSettingsWrites"

@Injectable()
export class SettingsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async stored(): Promise<Map<string, unknown>> {
    try {
      const rows = await this.prisma.ajustes_sistema.findMany({ select: { clave_ajuste: true, valor_ajuste: true } })
      return new Map(rows.map((row) => [row.clave_ajuste, row.valor_ajuste]))
    } catch {
      return new Map()
    }
  }

  async save(rows: SettingRow[], actorId: string, at: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const row of rows) {
        await tx.$executeRaw`insert into ajustes_sistema (clave_ajuste, valor_ajuste, modificado_por, modificado_en)
          values (${row.field}, ${JSON.stringify(row.value)}::jsonb, ${actorId}::uuid, to_timestamp(${at}))
          on conflict (clave_ajuste) do update set valor_ajuste = excluded.valor_ajuste, modificado_por = excluded.modificado_por, modificado_en = excluded.modificado_en`
      }
    })
  }
}
