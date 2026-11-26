import { Prisma } from "../../generated/prisma/client"
import { inTransaction, type Db } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import { epochText, fromEpoch, hasRows, iso8601 } from "../../prisma/sql"
import { phpJsonDecode, record } from "../configuration/phpValues"
import { storageWriter } from "../http/storageWriter"
import { uuid7 } from "../http/uuid7"
import { systemNow } from "../shared/clock"
import { createLogoStore } from "../shared/logoStore"
import { notificationScope, recipientsOn, type Mail } from "../notifications/queries"
import { withAfterCommit, type AfterCommit } from "../queue/dispatch"
import { signaturesOf, signedFactsOf } from "../syllabus/syllabusDetailQueries"
import { SUBJECT_CODE, SUBJECT_NAME, SYLLABUS_EXISTS, SYLLABUS_JOINS } from "../syllabus/syllabusSql"
import { rowsOf } from "../syllabus/teacherSyllabusQueries"
import { convertDocx, gotenbergEnabled, gotenbergSettings } from "./gotenbergConverter"
import { storedLogoSource } from "./rendererLogos"
import { type ExportJobDeps, type ExportJobStore, type ExportJobTx, type ExportRequestTx, type ExportSubject, type StoredObjectRow } from "./syllabusExport"
import { renderSyllabusDocuments } from "./syllabusRenderer"

const epoch = (column: string) => Prisma.raw(`extract(epoch from ${column})::bigint`)

export function exportRequestTxOn(executor: Db, afterCommit: AfterCommit, dispatch: (artifactId: string) => unknown): ExportRequestTx {
  return {
    async existingArtifact(revisionId, key) {
      const [row] = await rowsOf<{ id: string; state: string; requestedBy: string }>(
        executor,
        Prisma.sql`select "exportacion_silabo_id"::text as id, "estado_exportacion" as state, "solicitado_por"::text as "requestedBy" from "exportaciones_silabo"
        where ("exportaciones_silabo"."revision_silabo_id" = ${revisionId}::uuid and "exportaciones_silabo"."clave_solicitud" = ${key}::uuid) limit 1`,
      )
      return row ?? null
    },
    async lockSyllabus(syllabusId) {
      return hasRows(
        rowsOf(executor, Prisma.sql`select "silabo_id" from "silabos" where ("silabos"."silabo_id" = ${syllabusId}::uuid and ${SYLLABUS_EXISTS}) limit 1 for update of "silabos"`),
      )
    },
    async lockRevision(revisionId) {
      const [row] = await rowsOf<{ syllabusId: string; number: number }>(
        executor,
        Prisma.sql`select "silabo_id"::text as "syllabusId", "numero_revision" as number from "revisiones_silabo"
        where ("revisiones_silabo"."revision_silabo_id" = ${revisionId}::uuid
          and exists (select "silabo_id" from "silabos" where ("silabos"."silabo_id" = "revisiones_silabo"."silabo_id" and ${SYLLABUS_EXISTS})))
        limit 1 for update of "revisiones_silabo"`,
      )
      return row ? { syllabusId: row.syllabusId, number: Number(row.number) } : null
    },
    async approved(revisionId) {
      return hasRows(rowsOf(executor, Prisma.sql`select "aprobacion_id" from "aprobaciones" where "aprobaciones"."revision_silabo_id" = ${revisionId}::uuid limit 1`))
    },
    async insertArtifact(row) {
      await executor.$executeRaw`insert into "exportaciones_silabo" ("exportacion_silabo_id", "revision_silabo_id", "clave_solicitud", "estado_exportacion", "solicitado_por", "solicitado_en")
        values (${row.id}::uuid, ${row.revisionId}::uuid, ${row.key}::uuid, 'pendiente', ${row.requestedBy}::uuid, ${fromEpoch(row.requestedAt)})`
    },
    dispatchExport(artifactId) {
      afterCommit(() => dispatch(artifactId))
    },
  }
}

export function exportJobTxOn(executor: Db, afterCommit: AfterCommit, now: number, mail?: Mail): ExportJobTx {
  const recipients = recipientsOn(executor)
  const setState = async (id: string, state: string) => {
    await executor.$executeRaw`update "exportaciones_silabo" set "estado_exportacion" = ${state}
      where ("exportaciones_silabo"."exportacion_silabo_id" = ${id}::uuid and "exportaciones_silabo"."estado_exportacion" is distinct from ${state})`
  }
  return {
    notifications: notificationScope(executor, afterCommit, now, mail),
    async lockArtifact(id) {
      const [row] = await rowsOf<{ state: string }>(
        executor,
        Prisma.sql`select "estado_exportacion" as state from "exportaciones_silabo" where "exportaciones_silabo"."exportacion_silabo_id" = ${id}::uuid limit 1 for update`,
      )
      if (!row) return null
      const [owner] = await rowsOf<{ syllabusId: string | null; number: number }>(
        executor,
        Prisma.sql`select "silabos"."silabo_id"::text as "syllabusId", "revisiones_silabo"."numero_revision" as number from "exportaciones_silabo"
        inner join "revisiones_silabo" on "revisiones_silabo"."revision_silabo_id" = "exportaciones_silabo"."revision_silabo_id"
        left join "silabos" on ("silabos"."silabo_id" = "revisiones_silabo"."silabo_id" and ${SYLLABUS_EXISTS})
        where "exportaciones_silabo"."exportacion_silabo_id" = ${id}::uuid limit 1`,
      )
      return { state: row.state, syllabusId: owner?.syllabusId ?? "", revisionNumber: Number(owner?.number ?? 0) }
    },
    markRunning: (id) => setState(id, "en_ejecucion"),
    markFailed: (id) => setState(id, "fallido"),
    async complete(id, objectId, at) {
      await executor.$executeRaw`update "exportaciones_silabo" set "archivo_pdf_id" = ${objectId}::uuid, "estado_exportacion" = 'completado', "completado_en" = ${fromEpoch(at)}
        where "exportaciones_silabo"."exportacion_silabo_id" = ${id}::uuid`
    },
    teachersFor: (syllabusId) => recipients.teachersFor(syllabusId),
    administrators: () => recipients.administrators(),
  }
}

type ObjectRow = { id: string; mime: string; size: bigint | number; fingerprint: string }

const OBJECT = Prisma.sql`"archivo_id"::text as id, "tipo_archivo" as mime, "tamano_bytes" as size, "hash_archivo" as fingerprint`

function objectOf(row: ObjectRow): StoredObjectRow {
  return { id: row.id, mime: row.mime, size: Number(row.size), fingerprint: row.fingerprint.trimEnd() }
}

export function exportJobStoreOn(executor: Db): ExportJobStore {
  const findObject = async (disk: string, relative: string) => {
    const [row] = await rowsOf<ObjectRow>(
      executor,
      Prisma.sql`select ${OBJECT} from "archivos" where ("archivos"."disco" = ${disk} and "archivos"."ruta_archivo" = ${relative}) limit 1`,
    )
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
        Prisma.sql`select exportacion.exportacion_silabo_id::text as id, exportacion.solicitado_por::text as requested_by,
            ${iso8601(Prisma.raw("exportacion.solicitado_en"))} as requested_at, revision.revision_silabo_id::text as revision_id,
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
      const [row] = await rowsOf<{ approver: string | null; at: string }>(
        executor,
        Prisma.sql`select "usuarios"."nombre_usuario" as approver, ${epochText(Prisma.raw('"aprobaciones"."aprobado_en"'))} as at
        from "aprobaciones" left join "usuarios" on "usuarios"."usuario_id" = "aprobaciones"."aprobado_por"
        where "aprobaciones"."revision_silabo_id" = ${revisionId}::uuid limit 1`,
      )
      return row ? { approver: row.approver ?? "", at: Number(row.at) } : null
    },
    signedFacts: (syllabusId, revision) => signedFactsOf(executor, syllabusId, revision),
    signatures: (syllabusId) => signaturesOf(executor, syllabusId),
    findObject,
    async firstOrCreateObject(row) {
      const existing = await findObject(row.disk, row.path)
      if (existing !== null) return existing
      const [created] = await rowsOf<ObjectRow>(
        executor,
        Prisma.sql`insert into "archivos" ("archivo_id", "disco", "ruta_archivo", "nombre_archivo", "tipo_archivo", "tamano_bytes", "hash_archivo", "categoria", "subido_por", "almacenado_en")
        values (${row.id}::uuid, ${row.disk}, ${row.path}, ${row.name}, ${row.mime}, ${row.size}, ${row.fingerprint}, ${row.classification}, ${row.ownerId}::uuid, ${fromEpoch(row.storedAt)})
        on conflict ("disco", "ruta_archivo") do nothing returning ${OBJECT}`,
      )
      return created ? objectOf(created) : ((await findObject(row.disk, row.path)) as StoredObjectRow)
    },
  }
}

export async function writePrivateObject(disk: string, relative: string, bytes: Buffer): Promise<void> {
  await storageWriter().put(disk, relative, bytes)
}

export type TransactionRunner = <T>(work: (executor: Db) => Promise<T>) => Promise<T>

export function dbTransaction(prisma: PrismaService): TransactionRunner {
  return (work) => inTransaction(prisma, work)
}

export type ExportJobOptions = { now?: () => number; mail?: Mail; writeObject?: ExportJobDeps["writeObject"]; render?: ExportJobDeps["render"] }

export function exportJobDepsOn(executor: Db, transaction: TransactionRunner, options: ExportJobOptions = {}): ExportJobDeps {
  const now = options.now ?? systemNow
  const logos = storedLogoSource(createLogoStore(executor))
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

export function createExportJobDeps(prisma: PrismaService): ExportJobDeps {
  return exportJobDepsOn(prisma, dbTransaction(prisma))
}
