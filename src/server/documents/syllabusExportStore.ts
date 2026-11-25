import "server-only"
import { and, eq, exists, sql } from "drizzle-orm"
import { db } from "@/db"
import { epochText, fromEpoch, hasRows } from "@/db/expressions"
import { aprobaciones, archivos, exportacionesSilabo, revisionesSilabo, silabos, usuarios } from "@/db/schema"
import { phpJsonDecode, record } from "../configuration/phpValues"
import { storageWriter } from "../http/storageWriter"
import { uuid7 } from "../http/uuid7"
import { iso8601 } from "../http/sql"
import { notificationScope, recipientsOn, systemNow, type Mail } from "../notifications/queries"
import { withAfterCommit, type AfterCommit } from "../queue/dispatch"
import { signaturesOf, signedFactsOf } from "../syllabus/syllabusDetailQueries"
import { SUBJECT_CODE, SUBJECT_NAME, SYLLABUS_EXISTS, SYLLABUS_JOINS } from "../syllabus/syllabusSql"
import { rowsOf, type Executor } from "../syllabus/teacherSyllabusQueries"
import { convertDocx, gotenbergEnabled, gotenbergSettings } from "./gotenbergConverter"
import { storedLogoSource } from "./rendererLogos"
import { type ExportJobDeps, type ExportJobStore, type ExportJobTx, type ExportRequestTx, type ExportSubject, type StoredObjectRow } from "./syllabusExport"
import { renderSyllabusDocuments } from "./syllabusRenderer"

const epoch = (column: string) => sql.raw(`extract(epoch from ${column})::bigint`)

export function exportRequestTxOn(executor: Executor, afterCommit: AfterCommit, dispatch: (artifactId: string) => unknown): ExportRequestTx {
  return {
    async existingArtifact(revisionId, key) {
      const [row] = await executor
        .select({ id: exportacionesSilabo.exportacionSilaboId, state: exportacionesSilabo.estadoExportacion, requestedBy: exportacionesSilabo.solicitadoPor })
        .from(exportacionesSilabo)
        .where(and(eq(exportacionesSilabo.revisionSilaboId, revisionId), eq(exportacionesSilabo.claveSolicitud, key)))
        .limit(1)
      return row ?? null
    },
    async lockSyllabus(syllabusId) {
      return hasRows(
        executor
          .select({ id: silabos.silaboId })
          .from(silabos)
          .where(and(eq(silabos.silaboId, syllabusId), SYLLABUS_EXISTS))
          .limit(1)
          .for("update", { of: silabos }),
      )
    },
    async lockRevision(revisionId) {
      const [row] = await executor
        .select({ syllabusId: revisionesSilabo.silaboId, number: revisionesSilabo.numeroRevision })
        .from(revisionesSilabo)
        .where(
          and(
            eq(revisionesSilabo.revisionSilaboId, revisionId),
            exists(executor.select({ id: silabos.silaboId }).from(silabos).where(and(eq(silabos.silaboId, revisionesSilabo.silaboId), SYLLABUS_EXISTS))),
          ),
        )
        .limit(1)
        .for("update", { of: revisionesSilabo })
      return row ? { syllabusId: row.syllabusId, number: Number(row.number) } : null
    },
    async approved(revisionId) {
      return hasRows(executor.select({ id: aprobaciones.aprobacionId }).from(aprobaciones).where(eq(aprobaciones.revisionSilaboId, revisionId)).limit(1))
    },
    async insertArtifact(row) {
      await executor.insert(exportacionesSilabo).values({
        exportacionSilaboId: row.id,
        revisionSilaboId: row.revisionId,
        claveSolicitud: row.key,
        estadoExportacion: "pendiente",
        solicitadoPor: row.requestedBy,
        solicitadoEn: fromEpoch(row.requestedAt),
      })
    },
    dispatchExport(artifactId) {
      afterCommit(() => dispatch(artifactId))
    },
  }
}

export function exportJobTxOn(executor: Executor, afterCommit: AfterCommit, now: number, mail?: Mail): ExportJobTx {
  const recipients = recipientsOn(executor)
  const setState = async (id: string, state: string) => {
    await executor
      .update(exportacionesSilabo)
      .set({ estadoExportacion: state })
      .where(and(eq(exportacionesSilabo.exportacionSilaboId, id), sql`${exportacionesSilabo.estadoExportacion} is distinct from ${state}`))
  }
  return {
    notifications: notificationScope(executor, afterCommit, now, mail),
    async lockArtifact(id) {
      const [row] = await executor
        .select({ state: exportacionesSilabo.estadoExportacion })
        .from(exportacionesSilabo)
        .where(eq(exportacionesSilabo.exportacionSilaboId, id))
        .limit(1)
        .for("update")
      if (!row) return null
      const [owner] = await executor
        .select({ syllabusId: silabos.silaboId, number: revisionesSilabo.numeroRevision })
        .from(exportacionesSilabo)
        .innerJoin(revisionesSilabo, eq(revisionesSilabo.revisionSilaboId, exportacionesSilabo.revisionSilaboId))
        .leftJoin(silabos, and(eq(silabos.silaboId, revisionesSilabo.silaboId), SYLLABUS_EXISTS))
        .where(eq(exportacionesSilabo.exportacionSilaboId, id))
        .limit(1)
      return { state: row.state, syllabusId: owner?.syllabusId ?? "", revisionNumber: Number(owner?.number ?? 0) }
    },
    markRunning: (id) => setState(id, "en_ejecucion"),
    markFailed: (id) => setState(id, "fallido"),
    async complete(id, objectId, at) {
      await executor
        .update(exportacionesSilabo)
        .set({ archivoPdfId: objectId, estadoExportacion: "completado", completadoEn: fromEpoch(at) })
        .where(eq(exportacionesSilabo.exportacionSilaboId, id))
    },
    teachersFor: (syllabusId) => recipients.teachersFor(syllabusId),
    administrators: () => recipients.administrators(),
  }
}

const OBJECT = { id: archivos.archivoId, mime: archivos.tipoArchivo, size: archivos.tamanoBytes, fingerprint: archivos.hashArchivo }

function objectOf(row: { id: string; mime: string; size: number; fingerprint: string }): StoredObjectRow {
  return { id: row.id, mime: row.mime, size: Number(row.size), fingerprint: row.fingerprint.trimEnd() }
}

export function exportJobStoreOn(executor: Executor): ExportJobStore {
  const findObject = async (disk: string, relative: string) => {
    const [row] = await executor
      .select(OBJECT)
      .from(archivos)
      .where(and(eq(archivos.disco, disk), eq(archivos.rutaArchivo, relative)))
      .limit(1)
    return row ? objectOf(row) : null
  }
  return {
    async subject(artifactId): Promise<ExportSubject | null> {
      const [row] = await rowsOf<{
        id: string
        requested_by: string
        requested_at: string
        revision_id: string
        number: number
        fingerprint: string
        submitted_at: string
        snapshot: string | null
        syllabus_id: string
        subject: string
        code: string
        period: string
      }>(
        executor,
        sql`select exportacion.exportacion_silabo_id::text as id, exportacion.solicitado_por::text as requested_by,
            ${iso8601(sql.raw("exportacion.solicitado_en"))} as requested_at, revision.revision_silabo_id::text as revision_id,
            revision.numero_revision as number, revision.hash_contenido as fingerprint, ${epoch("revision.enviado_en")} as submitted_at,
            revision.contenido_enviado::text as snapshot, silabos.silabo_id::text as syllabus_id, ${SUBJECT_NAME} as subject, ${SUBJECT_CODE} as code,
            periodo.codigo_periodo_academico as period
          from exportaciones_silabo exportacion
            inner join revisiones_silabo revision on revision.revision_silabo_id = exportacion.revision_silabo_id
            inner join silabos on silabos.silabo_id = revision.silabo_id
            ${SYLLABUS_JOINS}
          where exportacion.exportacion_silabo_id = ${artifactId}::uuid limit 1`,
      )
      if (!row) return null
      return {
        artifactId: row.id,
        requestedBy: row.requested_by,
        requestedAt: row.requested_at,
        syllabusId: row.syllabus_id,
        subject: row.subject,
        code: row.code,
        period: row.period,
        revision: { id: row.revision_id, number: Number(row.number), fingerprint: row.fingerprint.trimEnd(), submittedAt: Number(row.submitted_at) },
        snapshot: record(phpJsonDecode(row.snapshot)),
      }
    },
    async approval(revisionId) {
      const [row] = await executor
        .select({ approver: usuarios.nombreUsuario, at: epochText(aprobaciones.aprobadoEn) })
        .from(aprobaciones)
        .leftJoin(usuarios, eq(usuarios.usuarioId, aprobaciones.aprobadoPor))
        .where(eq(aprobaciones.revisionSilaboId, revisionId))
        .limit(1)
      return row ? { approver: row.approver ?? "", at: Number(row.at) } : null
    },
    signedFacts: (syllabusId, revision) => signedFactsOf(executor, syllabusId, revision),
    signatures: (syllabusId) => signaturesOf(executor, syllabusId),
    findObject,
    async firstOrCreateObject(row) {
      const existing = await findObject(row.disk, row.path)
      if (existing !== null) return existing
      const [created] = await executor
        .insert(archivos)
        .values({
          archivoId: row.id,
          disco: row.disk,
          rutaArchivo: row.path,
          nombreArchivo: row.name,
          tipoArchivo: row.mime,
          tamanoBytes: row.size,
          hashArchivo: row.fingerprint,
          categoria: row.classification,
          subidoPor: row.ownerId,
          almacenadoEn: fromEpoch(row.storedAt),
        })
        .onConflictDoNothing({ target: [archivos.disco, archivos.rutaArchivo] })
        .returning(OBJECT)
      return created ? objectOf(created) : ((await findObject(row.disk, row.path)) as StoredObjectRow)
    },
  }
}

export async function writePrivateObject(disk: string, relative: string, bytes: Buffer): Promise<void> {
  await storageWriter().put(disk, relative, bytes)
}

export type TransactionRunner = <T>(work: (executor: Executor) => Promise<T>) => Promise<T>

export const dbTransaction: TransactionRunner = (work) => db.transaction((tx) => work(tx))

export type ExportJobOptions = { now?: () => number; mail?: Mail; writeObject?: ExportJobDeps["writeObject"]; render?: ExportJobDeps["render"] }

export function exportJobDepsOn(executor: Executor, transaction: TransactionRunner, options: ExportJobOptions = {}): ExportJobDeps {
  const now = options.now ?? systemNow
  const logos = storedLogoSource()
  return {
    store: exportJobStoreOn(executor),
    transaction: (work) => withAfterCommit((afterCommit) => transaction((inner) => work(exportJobTxOn(inner, afterCommit, now(), options.mail)))),
    render:
      options.render ??
      ((input) => {
        const settings = gotenbergSettings()
        return renderSyllabusDocuments(input, logos, gotenbergEnabled(settings) ? (docx, generatedAt) => convertDocx(docx, generatedAt, settings) : null)
      }),
    writeObject: options.writeObject ?? writePrivateObject,
    now,
    newId: uuid7,
  }
}

export function createExportJobDeps(): ExportJobDeps {
  return exportJobDepsOn(db, dbTransaction)
}
