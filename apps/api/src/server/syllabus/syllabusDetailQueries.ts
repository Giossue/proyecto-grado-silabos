import { Prisma } from "../../generated/prisma/client"
import type { PrismaService } from "../../prisma/prisma.service"
import { epochText, hasRows, isoText, jsonText, uuidList } from "../../prisma/sql"
import { isUuid } from "../academic/structure"
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

const epoch = (column: string) => Prisma.raw(`extract(epoch from ${column})::bigint`)

export async function signaturesOf(executor: Executor, syllabusId: string): Promise<SignatureRecord[]> {
  const rows = await rowsOf<{ role: string; name: string | null; signedAt: string; certificateName: string; serial: string; issuer: string }>(
    executor,
    Prisma.sql`select firmas_silabo.firmado_como as role, usuarios.nombre_usuario as name, ${epochText(Prisma.raw("firmas_silabo.firmado_en"))} as "signedAt",
        firmas_silabo.nombre_en_certificado as "certificateName", firmas_silabo.numero_certificado as serial, firmas_silabo.entidad_emisora as issuer
      from firmas_silabo left join usuarios on usuarios.usuario_id = firmas_silabo.usuario_id
      where firmas_silabo.silabo_id = ${syllabusId}::uuid`,
  )
  const rank = (role: string) => Math.max(SIGNATURE_ORDER.indexOf(role), 0)
  return rows
    .map((row) => ({ ...row, name: row.name as string, signedAt: Number(row.signedAt) }))
    .sort((left, right) => rank(left.role) - rank(right.role))
}

export async function reviewCommentsOf(executor: Executor, syllabusId: string, stage: string | null): Promise<ReviewComment[]> {
  const rows = await rowsOf<{ stage: string; comment: string; commented_at: string; commented_by: string | null; revision_number: number }>(
    executor,
    Prisma.sql`select coalesce(revisiones_silabo.correccion_etapa, '') as stage, coalesce(revisiones_silabo.correccion_justificacion, '') as comment,
        ${isoText(Prisma.raw("revisiones_silabo.correccion_solicitada_en"))} as commented_at, usuarios.nombre_usuario as commented_by,
        revisiones_silabo.numero_revision as revision_number
      from revisiones_silabo left join usuarios on usuarios.usuario_id = revisiones_silabo.correccion_solicitada_por
      where revisiones_silabo.silabo_id = ${syllabusId}::uuid and revisiones_silabo.correccion_solicitada_en is not null
        ${stage === null ? Prisma.empty : Prisma.sql`and revisiones_silabo.correccion_etapa = ${stage}`}
      order by revisiones_silabo.correccion_solicitada_en desc`,
  )
  return rows.map((row) => ({ ...row, commented_by: row.commented_by as string, revision_number: Number(row.revision_number) }))
}

type RevisionRow = {
  id: string
  number: number
  submitted_at: bigint
  submitted_by: string
  approved_at: bigint | null
  approver: string | null
  verified: boolean
  version_origin: number
  correction: boolean
  fingerprint: string
}

export async function revisionsOf(executor: Executor, syllabusId: string): Promise<DetailRevision[]> {
  const rows = await rowsOf<RevisionRow>(
    executor,
    Prisma.sql`select revisiones_silabo.revision_silabo_id::text as id, revisiones_silabo.numero_revision as number, ${epoch("revisiones_silabo.enviado_en")} as submitted_at,
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
  const [row] = await rowsOf<{ snapshot: string | null }>(
    executor,
    Prisma.sql`select ${jsonText(Prisma.raw("revisiones_silabo.contenido_enviado"))} as snapshot from revisiones_silabo
      where revisiones_silabo.revision_silabo_id = ${revisionId}::uuid limit 1`,
  )
  return phpJsonDecode(row?.snapshot ?? null)
}

export async function signedFactsOf(executor: Executor, syllabusId: string, revision: Pick<DetailRevision, "id" | "number">) {
  const [coordination] = await rowsOf<{ reviewer: string | null; at: string }>(
    executor,
    Prisma.sql`select usuarios.nombre_usuario as reviewer, ${epochText(Prisma.raw("revisiones_coordinacion.revisado_en"))} as at
      from revisiones_coordinacion
        inner join revisiones_silabo on revisiones_silabo.revision_silabo_id = revisiones_coordinacion.revision_silabo_id
        left join usuarios on usuarios.usuario_id = revisiones_coordinacion.revisado_por
      where revisiones_silabo.silabo_id = ${syllabusId}::uuid and revisiones_silabo.numero_revision <= ${revision.number}
      order by revisiones_coordinacion.revisado_en desc limit 1`,
  )
  const [verification] = await rowsOf<{ verifier: string | null; at: string }>(
    executor,
    Prisma.sql`select usuarios.nombre_usuario as verifier, ${epochText(Prisma.raw("envios_biblioteca.verificado_en"))} as at
      from envios_biblioteca left join usuarios on usuarios.usuario_id = envios_biblioteca.verificado_por
      where envios_biblioteca.revision_silabo_id = ${revision.id}::uuid and envios_biblioteca.verificado_en is not null limit 1`,
  )
  return {
    coordination: coordination ? { reviewer: coordination.reviewer as string, at: Number(coordination.at) } : null,
    verification: verification ? { verifier: verification.verifier as string, at: Number(verification.at) } : null,
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
        Prisma.sql`select ${SYLLABUS_DETAIL_COLUMNS}, silabos.version_borrador as version, silabos.datos_academicos_silabo::text as context
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
      const rows = await rowsOf<{ fieldId: string; value: string | null }>(
        executor,
        Prisma.sql`select valores_campo.definicion_campo_id as "fieldId", ${jsonText(Prisma.raw("valores_campo.valor_campo"))} as value
          from valores_campo where valores_campo.silabo_id = ${id}::uuid`,
      )
      return new Map(rows.map((row) => [row.fieldId, phpJsonDecode(row.value)]))
    },
    hasArchivedValues: (id) => syllabusHasArchivedValues(executor, id),
    archivedFields: (id) => archivedFieldsOf(executor, id),
    revisions: (id) => revisionsOf(executor, id),
    revisionSnapshot: (revisionId) => revisionSnapshotOf(executor, revisionId),
    signedFacts: (syllabusId, revision) => signedFactsOf(executor, syllabusId, revision),
    reviewComments: (id, stage) => reviewCommentsOf(executor, id, stage),
    signatures: (id) => signaturesOf(executor, id),
    async copySources(syllabus, userId) {
      const rows = await rowsOf<{ id: string; parallel: string; state: string }>(
        executor,
        Prisma.sql`select silabos.silabo_id as id, ${PARALLEL_CODE} as parallel, silabos.estado_silabo as state
          from silabos inner join paralelos paralelo on paralelo.paralelo_id = silabos.paralelo_id
          where silabos.convocatoria_carrera_id = ${syllabus.convocationId}::uuid and silabos.silabo_id <> ${syllabus.id}::uuid
            and (silabos.estado_silabo <> 'sin_iniciar' or silabos.iniciado_en is not null) and paralelo.asignatura_id = ${syllabus.subjectId}::uuid
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
        Prisma.sql`select definiciones_campo.definicion_campo_id as id, ${jsonText(Prisma.raw("definiciones_campo.contenido_definicion_campo"))} as content
          from definiciones_campo where definiciones_campo.definicion_campo_id in (${uuidList(valid)})`,
      )
      return new Map(rows.map((row) => [row.id, phpJsonDecode(row.content)]))
    },
  }
}

export function createSyllabusDetailStore(prisma: PrismaService): SyllabusDetailStore {
  return syllabusDetailStoreOn(prisma)
}

export async function syllabusHasArchivedValues(executor: Executor, syllabusId: string): Promise<boolean> {
  return hasRows(
    rowsOf(
      executor,
      Prisma.sql`select valores_campo.valor_campo_id as id from valores_campo
        inner join definiciones_campo on definiciones_campo.definicion_campo_id = valores_campo.definicion_campo_id
        where valores_campo.silabo_id = ${syllabusId}::uuid and definiciones_campo.vigente_en_plantilla = false limit 1`,
    ),
  )
}

export type ArchivedField = {
  sectionId: string
  sectionKey: string
  sectionTitle: string
  sectionOrientation: string
  id: string
  key: string
  label: string
  responsible: string
  content: unknown
}

export async function archivedFieldsOf(executor: Executor, syllabusId: string): Promise<ArchivedField[] | null> {
  if (!(await syllabusHasArchivedValues(executor, syllabusId))) return null
  const rows = await rowsOf<{
    sectionId: string
    sectionKey: string
    sectionTitle: string
    sectionOrientation: string
    id: string
    key: string | null
    label: string | null
    responsible: string
    stored: string | null
    hasValue: boolean
    content: string | null
  }>(
    executor,
    Prisma.sql`select secciones_plantilla.seccion_plantilla_id as "sectionId", secciones_plantilla.clave_seccion_plantilla as "sectionKey",
        secciones_plantilla.titulo_seccion_plantilla as "sectionTitle", secciones_plantilla.orientacion_seccion_plantilla as "sectionOrientation",
        definiciones_campo.definicion_campo_id as id, campos_plantilla.clave_campo_plantilla as key, campos_plantilla.titulo_campo_plantilla as label,
        definiciones_campo.quien_llena_definicion_campo as responsible, ${jsonText(Prisma.raw("valores_campo.valor_campo"))} as stored,
        valores_campo.silabo_id is not null as "hasValue", ${jsonText(Prisma.raw("definiciones_campo.contenido_definicion_campo"))} as content
      from definiciones_campo
        inner join campos_plantilla on campos_plantilla.campo_plantilla_id = definiciones_campo.campo_plantilla_id
        inner join secciones_plantilla on secciones_plantilla.seccion_plantilla_id = campos_plantilla.seccion_plantilla_id
        left join valores_campo on valores_campo.definicion_campo_id = definiciones_campo.definicion_campo_id and valores_campo.silabo_id = ${syllabusId}::uuid
      where definiciones_campo.definicion_campo_id in (select valores_campo.definicion_campo_id from valores_campo where valores_campo.silabo_id = ${syllabusId}::uuid)
      order by secciones_plantilla.posicion_seccion_plantilla, campos_plantilla.posicion_campo_plantilla`,
  )
  return rows.map(({ stored, hasValue, content, ...row }) => ({
    ...row,
    key: row.key ?? "",
    label: row.label ?? "",
    content: hasValue ? phpJsonDecode(stored) : phpJsonDecode(content),
  }))
}
