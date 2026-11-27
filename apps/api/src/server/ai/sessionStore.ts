import { Prisma } from "../../generated/prisma/client"

export type SessionSubject = { syllabusId: string } | { templateId: string }

export function openSessionSql(userId: string, subject: SessionSubject): Prisma.Sql {
  const [column, id] = "syllabusId" in subject ? [Prisma.raw("silabo_id"), subject.syllabusId] : [Prisma.raw("plantilla_id"), subject.templateId]
  return Prisma.sql`with sesion as (
    insert into sesiones_ia (sesion_ia_id, usuario_id, ${column}) values (gen_random_uuid(), ${userId}::uuid, ${id}::uuid)
    on conflict (usuario_id, ${column}) where cerrada_en is null do update set usuario_id = excluded.usuario_id
    returning sesion_ia_id)`
}
