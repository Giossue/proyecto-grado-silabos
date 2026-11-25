import { Inject, Injectable } from "@nestjs/common"
import type { NotificationRecord, NotificationRepository, NotificationWriteRepository, StoredNotification } from "../../server/operations/notifications"
import { Prisma } from "../../generated/prisma/client"
import { PrismaService } from "../../prisma/prisma.service"

const INSTITUTION_TIMEZONE = process.env.DISPLAY_TIMEZONE ?? "America/Guayaquil"

const isoText = (column: Prisma.Sql) => Prisma.sql`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"')`

function visibleTo(alias: string, userId: string): Prisma.Sql {
  const user = Prisma.raw(`${alias}.usuario_id`)
  const period = Prisma.raw(`${alias}.periodo_academico_id`)
  return Prisma.sql`${user} = ${userId}::uuid and (
    ${period} in (
      select cu.periodo_academico_id from convocatorias_universidad cu
      where cu.convocatoria_universidad_id = (
        select latest.convocatoria_universidad_id from convocatorias_universidad latest
        order by latest.fecha_inicio desc, latest.convocatoria_universidad_id desc limit 1
      )
    )
    or (
      ${period} not in (select any_process.periodo_academico_id from convocatorias_universidad any_process)
      and ${period} in (
        select p.periodo_academico_id from periodos_academicos p
        where p.fecha_fin_periodo::date >= (now() at time zone ${INSTITUTION_TIMEZONE})::date
      )
    )
  )`
}

function visible(userId: string, onlyUnread: boolean): Prisma.Sql {
  return onlyUnread ? Prisma.sql`${visibleTo("n", userId)} and n.leido_en is null` : visibleTo("n", userId)
}

@Injectable()
export class NotificationsRepository implements NotificationRepository, NotificationWriteRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async visibleCount(where: Prisma.Sql): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ total: number }[]>`select count(*)::int as total from notificaciones n where ${where}`
    return row?.total ?? 0
  }

  async page(userId: string, { page, perPage, onlyUnread }: { page: number; perPage: number; onlyUnread: boolean }): Promise<{ total: number; items: NotificationRecord[] }> {
    const where = visible(userId, onlyUnread)
    const total = await this.visibleCount(where)
    if (total === 0) return { total: 0, items: [] }
    const items = await this.prisma.$queryRaw<NotificationRecord[]>`
      select n.notificacion_id::text as "id", n.tipo_notificacion as "type", n.titulo_notificacion as "title", n.mensaje_notificacion as "message",
        n.tipo_recurso as "resourceType", n.recurso_id::text as "resourceId",
        ${isoText(Prisma.raw("n.leido_en"))} as "readAt", ${isoText(Prisma.raw("n.notificado_en"))} as "notifiedAt"
      from notificaciones n
      where ${where}
      order by n.notificado_en desc
      limit ${perPage} offset ${(page - 1) * perPage}`
    return { total, items }
  }

  unreadCount(userId: string): Promise<number> {
    return this.visibleCount(visible(userId, true))
  }

  async find(id: string): Promise<StoredNotification | null> {
    const row = await this.prisma.notificaciones.findUnique({
      where: { notificacion_id: id },
      select: { notificacion_id: true, usuario_id: true, tipo_notificacion: true, tipo_recurso: true, recurso_id: true, leido_en: true },
    })
    if (!row) return null
    return {
      id: row.notificacion_id,
      userId: row.usuario_id,
      type: row.tipo_notificacion,
      resourceType: row.tipo_recurso,
      resourceId: row.recurso_id,
      readAt: row.leido_en?.toISOString() ?? null,
    }
  }

  async markRead(id: string, at: number): Promise<void> {
    await this.prisma.notificaciones.updateMany({ where: { notificacion_id: id }, data: { leido_en: new Date(at * 1000) } })
  }

  async markAllRead(userId: string, at: number): Promise<void> {
    await this.prisma.$executeRaw`update notificaciones n set leido_en = to_timestamp(${at}) where ${visibleTo("n", userId)} and n.leido_en is null`
  }

  async saveEmailPreferences(userId: string, preferences: Record<string, unknown>): Promise<void> {
    await this.prisma.usuarios.updateMany({ where: { usuario_id: userId }, data: { preferencias_correo_usuario: preferences as Prisma.InputJsonObject } })
  }
}
