import "server-only"
import { and, desc, eq, inArray, isNotNull, lte, ne, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { db } from "@/db"
import { epochText, hasRows, isoText, jsonText } from "@/db/expressions"
import {
  camposPlantilla,
  definicionesCampo,
  enviosBiblioteca,
  firmasSilabo,
  paralelos,
  revisionesCoordinacion,
  revisionesSilabo,
  seccionesPlantilla,
  silabos,
  usuarios,
  valoresCampo,
} from "@/db/schema"
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

const epoch = (column: string) => sql.raw(`extract(epoch from ${column})::bigint`)

export async function signaturesOf(executor: Executor, syllabusId: string): Promise<SignatureRecord[]> {
  const rows = await executor
    .select({
      role: firmasSilabo.firmadoComo,
      name: usuarios.nombreUsuario,
      signedAt: epochText(firmasSilabo.firmadoEn),
      certificateName: firmasSilabo.nombreEnCertificado,
      serial: firmasSilabo.numeroCertificado,
      issuer: firmasSilabo.entidadEmisora,
    })
    .from(firmasSilabo)
    .leftJoin(usuarios, eq(usuarios.usuarioId, firmasSilabo.usuarioId))
    .where(eq(firmasSilabo.silaboId, syllabusId))
  const rank = (role: string) => Math.max(SIGNATURE_ORDER.indexOf(role), 0)
  return rows
    .map((row) => ({ ...row, name: row.name as string, signedAt: Number(row.signedAt) }))
    .sort((left, right) => rank(left.role) - rank(right.role))
}

export async function reviewCommentsOf(executor: Executor, syllabusId: string, stage: string | null): Promise<ReviewComment[]> {
  const rows = await executor
    .select({
      stage: sql<string>`coalesce(${revisionesSilabo.correccionEtapa}, '')`,
      comment: sql<string>`coalesce(${revisionesSilabo.correccionJustificacion}, '')`,
      commented_at: isoText(revisionesSilabo.correccionSolicitadaEn),
      commented_by: usuarios.nombreUsuario,
      revision_number: revisionesSilabo.numeroRevision,
    })
    .from(revisionesSilabo)
    .leftJoin(usuarios, eq(usuarios.usuarioId, revisionesSilabo.correccionSolicitadaPor))
    .where(
      and(
        eq(revisionesSilabo.silaboId, syllabusId),
        isNotNull(revisionesSilabo.correccionSolicitadaEn),
        stage === null ? undefined : eq(revisionesSilabo.correccionEtapa, stage),
      ),
    )
    .orderBy(desc(revisionesSilabo.correccionSolicitadaEn))
  return rows.map((row) => ({ ...row, commented_by: row.commented_by as string, revision_number: Number(row.revision_number) }))
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
  const [row] = await executor
    .select({ snapshot: jsonText(revisionesSilabo.contenidoEnviado) })
    .from(revisionesSilabo)
    .where(eq(revisionesSilabo.revisionSilaboId, revisionId))
    .limit(1)
  return phpJsonDecode(row?.snapshot ?? null)
}

export async function signedFactsOf(executor: Executor, syllabusId: string, revision: Pick<DetailRevision, "id" | "number">) {
  const [coordination] = await executor
    .select({ reviewer: usuarios.nombreUsuario, at: epochText(revisionesCoordinacion.revisadoEn) })
    .from(revisionesCoordinacion)
    .innerJoin(revisionesSilabo, eq(revisionesSilabo.revisionSilaboId, revisionesCoordinacion.revisionSilaboId))
    .leftJoin(usuarios, eq(usuarios.usuarioId, revisionesCoordinacion.revisadoPor))
    .where(and(eq(revisionesSilabo.silaboId, syllabusId), lte(revisionesSilabo.numeroRevision, revision.number)))
    .orderBy(desc(revisionesCoordinacion.revisadoEn))
    .limit(1)
  const [verification] = await executor
    .select({ verifier: usuarios.nombreUsuario, at: epochText(enviosBiblioteca.verificadoEn) })
    .from(enviosBiblioteca)
    .leftJoin(usuarios, eq(usuarios.usuarioId, enviosBiblioteca.verificadoPor))
    .where(and(eq(enviosBiblioteca.revisionSilaboId, revision.id), isNotNull(enviosBiblioteca.verificadoEn)))
    .limit(1)
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
      const rows = await executor
        .select({ fieldId: valoresCampo.definicionCampoId, value: jsonText(valoresCampo.valorCampo) })
        .from(valoresCampo)
        .where(eq(valoresCampo.silaboId, id))
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
      const paralelo = alias(paralelos, "paralelo")
      const rows = await executor
        .select({ id: silabos.silaboId, parallel: sql<string>`${PARALLEL_CODE}`, state: silabos.estadoSilabo })
        .from(silabos)
        .innerJoin(paralelo, eq(paralelo.paraleloId, silabos.paraleloId))
        .where(
          and(
            eq(silabos.convocatoriaCarreraId, syllabus.convocationId),
            ne(silabos.silaboId, syllabus.id),
            ne(silabos.estadoSilabo, "sin_iniciar"),
            eq(paralelo.asignaturaId, syllabus.subjectId),
            currentTeacherSql(userId),
            SYLLABUS_EXISTS,
          ),
        )
      return rows.sort((left, right) => phpCompareStrings(left.parallel, right.parallel))
    },
    identification: (id) => identificationSource(executor, id),
    async fieldContents(ids) {
      const valid = ids.filter(isUuid)
      if (valid.length === 0) return new Map()
      const rows = await executor
        .select({ id: definicionesCampo.definicionCampoId, content: jsonText(definicionesCampo.contenidoDefinicionCampo) })
        .from(definicionesCampo)
        .where(inArray(definicionesCampo.definicionCampoId, valid))
      return new Map(rows.map((row) => [row.id, phpJsonDecode(row.content)]))
    },
  }
}

export function createSyllabusDetailStore(): SyllabusDetailStore {
  return syllabusDetailStoreOn(db)
}

export async function syllabusHasArchivedValues(executor: Executor, syllabusId: string): Promise<boolean> {
  return hasRows(
    executor
      .select({ id: valoresCampo.valorCampoId })
      .from(valoresCampo)
      .innerJoin(definicionesCampo, eq(definicionesCampo.definicionCampoId, valoresCampo.definicionCampoId))
      .where(and(eq(valoresCampo.silaboId, syllabusId), eq(definicionesCampo.vigenteEnPlantilla, false)))
      .limit(1),
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
  const rows = await executor
    .select({
      sectionId: seccionesPlantilla.seccionPlantillaId,
      sectionKey: seccionesPlantilla.claveSeccionPlantilla,
      sectionTitle: seccionesPlantilla.tituloSeccionPlantilla,
      sectionOrientation: seccionesPlantilla.orientacionSeccionPlantilla,
      id: definicionesCampo.definicionCampoId,
      key: camposPlantilla.claveCampoPlantilla,
      label: camposPlantilla.tituloCampoPlantilla,
      responsible: definicionesCampo.quienLlenaDefinicionCampo,
      stored: jsonText(valoresCampo.valorCampo),
      hasValue: isNotNull(valoresCampo.silaboId).mapWith(Boolean),
      content: jsonText(definicionesCampo.contenidoDefinicionCampo),
    })
    .from(definicionesCampo)
    .innerJoin(camposPlantilla, eq(camposPlantilla.campoPlantillaId, definicionesCampo.campoPlantillaId))
    .innerJoin(seccionesPlantilla, eq(seccionesPlantilla.seccionPlantillaId, camposPlantilla.seccionPlantillaId))
    .leftJoin(valoresCampo, and(eq(valoresCampo.definicionCampoId, definicionesCampo.definicionCampoId), eq(valoresCampo.silaboId, syllabusId)))
    .where(
      inArray(
        definicionesCampo.definicionCampoId,
        executor.select({ id: valoresCampo.definicionCampoId }).from(valoresCampo).where(eq(valoresCampo.silaboId, syllabusId)),
      ),
    )
    .orderBy(seccionesPlantilla.posicionSeccionPlantilla, camposPlantilla.posicionCampoPlantilla)
  return rows.map(({ stored, hasValue, content, ...row }) => ({
    ...row,
    key: row.key ?? "",
    label: row.label ?? "",
    content: hasValue ? phpJsonDecode(stored) : phpJsonDecode(content),
  }))
}
