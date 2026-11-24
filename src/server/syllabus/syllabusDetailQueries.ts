import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { isUuid } from "../academic/structure"
import { iso8601, uuidList } from "../laravel/sql"
import { phpJsonDecode } from "../configuration/phpValues"
import { teacherNamesOf } from "./coordinationReviewQueries"
import { identificationSource, syllabusFacts } from "./draftFieldStore"
import { SIGNATURE_ORDER, type SignatureRecord } from "./snapshotDocuments"
import type { DetailRevision, DetailSyllabus, ReviewComment, SyllabusDetailStore } from "./syllabusDetail"
import { currentTeacherSql, PARALLEL_CODE, SYLLABUS_DETAIL_COLUMNS, SYLLABUS_EXISTS, SYLLABUS_JOINS } from "./syllabusSql"
import { rowsOf, type Executor } from "./teacherSyllabusQueries"

const NUMERIC = /^[ \t\n\r\v\f]*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?[ \t\n\r\v\f]*$/

export function phpCompareStrings(left: string, right: string): number {
  if (NUMERIC.test(left) && NUMERIC.test(right)) return Math.sign(Number(left) - Number(right))
  return left < right ? -1 : left > right ? 1 : 0
}

const epoch = (column: string) => sql.raw(`extract(epoch from ${column})::bigint`)

export async function signaturesOf(executor: Executor, syllabusId: string): Promise<SignatureRecord[]> {
  const rows = await rowsOf<{ role: string; name: string; signed_at: string; certificate_name: string; serial: string; issuer: string }>(
    executor,
    sql`select firmas_silabo.firmado_como as role, usuarios.nombre_usuario as name, ${epoch("firmas_silabo.firmado_en")} as signed_at,
        firmas_silabo.nombre_en_certificado as certificate_name, firmas_silabo.numero_certificado as serial, firmas_silabo.entidad_emisora as issuer
      from firmas_silabo left join usuarios on usuarios.usuario_id = firmas_silabo.usuario_id where firmas_silabo.silabo_id = ${syllabusId}::uuid`,
  )
  const rank = (role: string) => Math.max(SIGNATURE_ORDER.indexOf(role), 0)
  return rows
    .map((row) => ({ role: row.role, name: row.name, signedAt: Number(row.signed_at), certificateName: row.certificate_name, serial: row.serial, issuer: row.issuer }))
    .sort((left, right) => rank(left.role) - rank(right.role))
}

export async function reviewCommentsOf(executor: Executor, syllabusId: string, stage: string | null): Promise<ReviewComment[]> {
  const rows = await rowsOf<ReviewComment>(
    executor,
    sql`select coalesce(revisiones_silabo.correccion_etapa, '') as stage, coalesce(revisiones_silabo.correccion_justificacion, '') as comment,
        ${iso8601(sql.raw("revisiones_silabo.correccion_solicitada_en"))} as commented_at, usuarios.nombre_usuario as commented_by,
        revisiones_silabo.numero_revision as revision_number
      from revisiones_silabo left join usuarios on usuarios.usuario_id = revisiones_silabo.correccion_solicitada_por
      where revisiones_silabo.silabo_id = ${syllabusId}::uuid and revisiones_silabo.correccion_solicitada_en is not null
        ${stage === null ? sql`` : sql`and revisiones_silabo.correccion_etapa = ${stage}`}
      order by revisiones_silabo.correccion_solicitada_en desc`,
  )
  return rows.map((row) => ({ ...row, revision_number: Number(row.revision_number) }))
}

type RevisionRow = {
  id: string
  number: number
  submitted_at: string
  submitted_by: string
  approved_at: string | null
  approver: string | null
  verified: boolean
  version_origin: number
  correction: boolean
  fingerprint: string
}

export async function revisionsOf(executor: Executor, syllabusId: string): Promise<DetailRevision[]> {
  const rows = await rowsOf<RevisionRow>(
    executor,
    sql`select revisiones_silabo.revision_silabo_id::text as id, revisiones_silabo.numero_revision as number, ${epoch("revisiones_silabo.enviado_en")} as submitted_at,
        remitente.nombre_usuario as submitted_by, ${epoch("aprobacion.aprobado_en")} as approved_at, aprobador.nombre_usuario as approver,
        exists (select 1 from envios_biblioteca where envios_biblioteca.revision_silabo_id = revisiones_silabo.revision_silabo_id and envios_biblioteca.verificado_en is not null) as verified,
        revisiones_silabo.version_borrador as version_origin, revisiones_silabo.correccion_solicitada_en is not null as correction,
        revisiones_silabo.hash_contenido as fingerprint
      from revisiones_silabo
        left join usuarios remitente on remitente.usuario_id = revisiones_silabo.enviado_por
        left join lateral (select aprobaciones.aprobado_en, aprobaciones.aprobado_por from aprobaciones
          where aprobaciones.revision_silabo_id = revisiones_silabo.revision_silabo_id limit 1) aprobacion on true
        left join usuarios aprobador on aprobador.usuario_id = aprobacion.aprobado_por
      where revisiones_silabo.silabo_id = ${syllabusId}::uuid order by revisiones_silabo.numero_revision`,
  )
  return rows.map((row) => ({
    id: row.id,
    number: Number(row.number),
    submittedAt: Number(row.submitted_at),
    submittedBy: row.submitted_by,
    approval: row.approved_at === null ? null : { approver: row.approver ?? "", at: Number(row.approved_at) },
    verified: row.verified,
    versionOrigin: Number(row.version_origin),
    correctionRequested: row.correction,
    fingerprint: row.fingerprint,
  }))
}

export async function revisionSnapshotOf(executor: Executor, revisionId: string): Promise<unknown> {
  const [row] = await rowsOf<{ snapshot: string | null }>(executor, sql`select contenido_enviado::text as snapshot from revisiones_silabo where revision_silabo_id = ${revisionId}::uuid limit 1`)
  return phpJsonDecode(row?.snapshot ?? null)
}

export async function signedFactsOf(executor: Executor, syllabusId: string, revision: Pick<DetailRevision, "id" | "number">) {
  const [coordination] = await rowsOf<{ reviewer: string; at: string }>(
    executor,
    sql`select usuarios.nombre_usuario as reviewer, ${epoch("revisiones_coordinacion.revisado_en")} as at
      from revisiones_coordinacion inner join revisiones_silabo on revisiones_silabo.revision_silabo_id = revisiones_coordinacion.revision_silabo_id
        left join usuarios on usuarios.usuario_id = revisiones_coordinacion.revisado_por
      where revisiones_silabo.silabo_id = ${syllabusId}::uuid and revisiones_silabo.numero_revision <= ${revision.number}
      order by revisiones_coordinacion.revisado_en desc limit 1`,
  )
  const [verification] = await rowsOf<{ verifier: string; at: string }>(
    executor,
    sql`select usuarios.nombre_usuario as verifier, ${epoch("envios_biblioteca.verificado_en")} as at
      from envios_biblioteca left join usuarios on usuarios.usuario_id = envios_biblioteca.verificado_por
      where envios_biblioteca.revision_silabo_id = ${revision.id}::uuid and envios_biblioteca.verificado_en is not null limit 1`,
  )
  return {
    coordination: coordination ? { reviewer: coordination.reviewer, at: Number(coordination.at) } : null,
    verification: verification ? { verifier: verification.verifier, at: Number(verification.at) } : null,
  }
}

type DetailRow = { version: number; context: string | null; convocation_id: string; subject: string; code: string; parallel: string; career: string; period: string; started_at: string | null; saved_at: string | null }

export function syllabusDetailStoreOn(executor: Executor): SyllabusDetailStore {
  return {
    async syllabus(id, userId) {
      const facts = await syllabusFacts(executor, id, userId)
      if (facts === null) return null
      const [row] = await rowsOf<DetailRow>(
        executor,
        sql`select ${SYLLABUS_DETAIL_COLUMNS}, silabos.version_borrador as version, silabos.datos_academicos_silabo::text as context
          from silabos ${SYLLABUS_JOINS} where silabos.silabo_id = ${facts.id}::uuid limit 1`,
      )
      if (!row) return null
      const syllabus: DetailSyllabus = {
        ...facts,
        convocationId: row.convocation_id,
        subject: row.subject,
        code: row.code,
        parallel: row.parallel,
        career: row.career,
        period: row.period,
        startedAt: row.started_at,
        savedAt: row.saved_at,
        version: Number(row.version),
        context: phpJsonDecode(row.context ?? "null"),
      }
      return syllabus
    },
    teachers: async (id) => (await teacherNamesOf(executor, [id])).get(id) ?? [],
    async values(id) {
      const rows = await rowsOf<{ field_id: string; value: string | null }>(
        executor,
        sql`select definicion_campo_id::text as field_id, valor_campo::text as value from valores_campo where silabo_id = ${id}::uuid`,
      )
      return new Map(rows.map((row) => [row.field_id, phpJsonDecode(row.value)]))
    },
    async hasArchivedValues(id) {
      const [row] = await rowsOf<{ found: boolean }>(
        executor,
        sql`select exists (select 1 from valores_campo inner join definiciones_campo on definiciones_campo.definicion_campo_id = valores_campo.definicion_campo_id
          where valores_campo.silabo_id = ${id}::uuid and definiciones_campo.vigente_en_plantilla = false) as found`,
      )
      return row?.found === true
    },
    revisions: (id) => revisionsOf(executor, id),
    revisionSnapshot: (revisionId) => revisionSnapshotOf(executor, revisionId),
    signedFacts: (syllabusId, revision) => signedFactsOf(executor, syllabusId, revision),
    reviewComments: (id, stage) => reviewCommentsOf(executor, id, stage),
    signatures: (id) => signaturesOf(executor, id),
    async copySources(syllabus, userId) {
      const rows = await rowsOf<{ id: string; parallel: string; state: string }>(
        executor,
        sql`select silabos.silabo_id::text as id, ${PARALLEL_CODE} as parallel, silabos.estado_silabo as state
          from silabos inner join paralelos paralelo on paralelo.paralelo_id = silabos.paralelo_id
          where silabos.convocatoria_carrera_id = ${syllabus.convocationId}::uuid and silabos.silabo_id != ${syllabus.id}::uuid
            and silabos.estado_silabo != 'sin_iniciar' and paralelo.asignatura_id = ${syllabus.subjectId}::uuid
            and ${currentTeacherSql(userId)} and ${SYLLABUS_EXISTS}`,
      )
      return rows.sort((left, right) => phpCompareStrings(left.parallel, right.parallel))
    },
    identification: (id) => identificationSource(executor, id),
    async fieldContents(ids) {
      const valid = ids.filter(isUuid)
      if (valid.length === 0) return new Map()
      const rows = await rowsOf<{ id: string; content: string | null }>(
        executor,
        sql`select definicion_campo_id::text as id, contenido_definicion_campo::text as content from definiciones_campo where definicion_campo_id in (${uuidList(valid)})`,
      )
      return new Map(rows.map((row) => [row.id, phpJsonDecode(row.content)]))
    },
  }
}

export function createSyllabusDetailStore(): SyllabusDetailStore {
  return syllabusDetailStoreOn(db as unknown as Executor)
}
