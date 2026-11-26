import { Prisma } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import { epochText, iso8601 } from "../../prisma/sql"
import { LIBRARY_FROM, OUTCOME_SQL, RESPONSIBLE_SQL, STATE_SQL } from "../library/reviewQueries"
import { teacherNamesOf } from "./coordinationReviewQueries"
import type { HistoryEntry, ReviewDetailStore } from "./reviewDetails"
import { reviewCommentsOf, revisionSnapshotOf, signaturesOf, syllabusDetailStoreOn } from "./syllabusDetailQueries"
import { rowsOf } from "./teacherSyllabusQueries"

const REVISION_EXISTS = Prisma.sql`exists (select 1 from silabos silabo_revision where silabo_revision.silabo_id = revisiones_silabo.silabo_id
  and exists (select 1 from convocatorias_carreras convocatoria_revision where convocatoria_revision.convocatoria_carrera_id = silabo_revision.convocatoria_carrera_id
    and exists (select 1 from convocatorias_universidad proceso_revision where proceso_revision.convocatoria_universidad_id = convocatoria_revision.convocatoria_universidad_id)))`

type HistoryRow = {
  id: string
  number: number
  submitted_at: string
  submitted_by: string
  reviewed_at: string | null
  reviewer_id: string | null
  reviewer: string | null
  approved_at: string | null
  approver_id: string | null
  approver: string | null
  has_submission: boolean
  verified_at: string | null
  verifier: string | null
  inherited: boolean | null
  correction_stage: string | null
  correction_at: string | null
  correction_by: string | null
  justification: string | null
}

export function reviewDetailStoreOn(executor: Db): ReviewDetailStore {
  const syllabi = syllabusDetailStoreOn(executor)
  return {
    async revision(id) {
      const [row] = await rowsOf<{ id: string; syllabusId: string; number: number; submittedAt: string; submittedBy: string | null; fingerprint: string }>(
        executor,
        Prisma.sql`select "revisiones_silabo"."revision_silabo_id"::text as id, "revisiones_silabo"."silabo_id"::text as "syllabusId", "revisiones_silabo"."numero_revision" as number,
          ${epochText(Prisma.raw('"revisiones_silabo"."enviado_en"'))} as "submittedAt", "usuarios"."nombre_usuario" as "submittedBy", "revisiones_silabo"."hash_contenido" as fingerprint
        from "revisiones_silabo" left join "usuarios" on "usuarios"."usuario_id" = "revisiones_silabo"."enviado_por"
        where ("revisiones_silabo"."revision_silabo_id" = ${id}::uuid and ${REVISION_EXISTS}) limit 1`,
      )
      return row ? { ...row, number: Number(row.number), submittedAt: Number(row.submittedAt), submittedBy: row.submittedBy as string } : null
    },
    syllabus: (id, userId) => syllabi.syllabus(id, userId),
    teachers: async (id) => (await teacherNamesOf(executor, [id])).get(id) ?? [],
    async history(syllabusId) {
      const rows = await rowsOf<HistoryRow>(
        executor,
        Prisma.sql`select revisiones_silabo.revision_silabo_id::text as id, revisiones_silabo.numero_revision as number,
            ${iso8601(Prisma.raw("revisiones_silabo.enviado_en"))} as submitted_at, remitente.nombre_usuario as submitted_by,
            ${iso8601(Prisma.raw("revision_coordinacion.revisado_en"))} as reviewed_at, revision_coordinacion.revisado_por::text as reviewer_id, revisor.nombre_usuario as reviewer,
            ${iso8601(Prisma.raw("aprobacion.aprobado_en"))} as approved_at, aprobacion.aprobado_por::text as approver_id, aprobador.nombre_usuario as approver,
            envio.envio_biblioteca_id is not null as has_submission, ${iso8601(Prisma.raw("envio.verificado_en"))} as verified_at, verificador.nombre_usuario as verifier,
            envio.verificacion_heredada as inherited, revisiones_silabo.correccion_etapa as correction_stage,
            ${iso8601(Prisma.raw("revisiones_silabo.correccion_solicitada_en"))} as correction_at, solicitante.nombre_usuario as correction_by,
            revisiones_silabo.correccion_justificacion as justification
          from revisiones_silabo
            left join usuarios remitente on remitente.usuario_id = revisiones_silabo.enviado_por
            left join lateral (select * from revisiones_coordinacion where revisiones_coordinacion.revision_silabo_id = revisiones_silabo.revision_silabo_id limit 1) revision_coordinacion on true
            left join usuarios revisor on revisor.usuario_id = revision_coordinacion.revisado_por
            left join lateral (select * from aprobaciones where aprobaciones.revision_silabo_id = revisiones_silabo.revision_silabo_id limit 1) aprobacion on true
            left join usuarios aprobador on aprobador.usuario_id = aprobacion.aprobado_por
            left join lateral (select * from envios_biblioteca where envios_biblioteca.revision_silabo_id = revisiones_silabo.revision_silabo_id limit 1) envio on true
            left join usuarios verificador on verificador.usuario_id = envio.verificado_por
            left join usuarios solicitante on solicitante.usuario_id = revisiones_silabo.correccion_solicitada_por
          where revisiones_silabo.silabo_id = ${syllabusId}::uuid order by revisiones_silabo.numero_revision`,
      )
      return rows.map(
        (row): HistoryEntry => ({
          id: row.id,
          number: Number(row.number),
          submittedAt: row.submitted_at,
          submittedBy: row.submitted_by,
          coordination: row.reviewed_at === null ? null : { at: row.reviewed_at, reviewerId: row.reviewer_id ?? "", reviewer: row.reviewer ?? "" },
          approval: row.approved_at === null ? null : { at: row.approved_at, approverId: row.approver_id ?? "", approver: row.approver ?? "" },
          library: row.has_submission ? { verifiedAt: row.verified_at, verifier: row.verifier, inherited: row.inherited === true } : null,
          correction: row.correction_at === null ? null : { stage: row.correction_stage ?? "", at: row.correction_at, by: row.correction_by, justification: row.justification },
        }),
      )
    },
    snapshot: (revisionId) => revisionSnapshotOf(executor, revisionId),
    signatures: (syllabusId) => signaturesOf(executor, syllabusId),
    async librarySubmission(revisionId) {
      const [row] = await rowsOf<{ sent_at: string; sent_by: string; verified_at: string | null; verified_by: string | null; state: string; outcome: string | null; responsible_id: string | null }>(
        executor,
        Prisma.sql`select extract(epoch from revision.enviado_en)::bigint as sent_at, remitente.nombre_usuario as sent_by,
            ${iso8601(Prisma.raw("envios_biblioteca.verificado_en"))} as verified_at, verificador.nombre_usuario as verified_by,
            ${STATE_SQL} as state, ${OUTCOME_SQL} as outcome, (${RESPONSIBLE_SQL})::text as responsible_id
          ${LIBRARY_FROM}
            left join usuarios remitente on remitente.usuario_id = revision.enviado_por
            left join usuarios verificador on verificador.usuario_id = envios_biblioteca.verificado_por
          where envios_biblioteca.revision_silabo_id = ${revisionId}::uuid limit 1`,
      )
      return row
        ? { sentAt: Number(row.sent_at), sentBy: row.sent_by, verifiedAt: row.verified_at, verifiedBy: row.verified_by, state: row.state, outcome: row.outcome, responsibleId: row.responsible_id }
        : null
    },
    async userName(id) {
      const [row] = await rowsOf<{ name: string }>(executor, Prisma.sql`select "nombre_usuario" as name from "usuarios" where "usuarios"."usuario_id" = ${id}::uuid limit 1`)
      return row?.name ?? null
    },
    comments: (syllabusId, stage) => reviewCommentsOf(executor, syllabusId, stage),
  }
}

export function createReviewDetailStore(prisma: PrismaService): ReviewDetailStore {
  return reviewDetailStoreOn(prisma)
}
