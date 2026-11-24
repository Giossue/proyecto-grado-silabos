import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { defaultBridgeDeps } from "../auth/requireSession"
import type { BridgeDeps } from "../auth/types"
import { createLogoStore } from "../configuration/institutionalLogos"
import { createTemplateStore } from "../configuration/templateStore"
import { phpJsonDecode, type PhpRecord } from "../configuration/phpValues"
import { institutionToday } from "../dashboard/dashboardQueries"
import { canonicalJson, hasAmbiguousNumbers } from "../documents/canonicalJson"
import { buildSyllabusSnapshot } from "../documents/syllabusSnapshot"
import { snapshotSourceOn } from "../documents/syllabusSnapshotStore"
import { institutionDateSql } from "../laravel/sql"
import { uuid7 } from "../laravel/uuid7"
import { notificationScope, recipientsOn, systemNow, type WriteOptions } from "../notifications/queries"
import { withAfterCommit } from "../queue/dispatch"
import { signatureTxOn } from "../signatures/signatureStore"
import { validateDraft } from "./draftValidation"
import { draftValidationStoreOn, validationTx } from "./draftValidationQueries"
import { dbTransaction, type TransactionRunner } from "./reviewDecisionStore"
import { NeedsLaravel } from "./snapshotDocuments"
import type { SubmissionDeps, SubmissionStore, SubmissionTx } from "./submission"
import { syllabusPayload } from "./syllabusDetail"
import { syllabusDetailStoreOn } from "./syllabusDetailQueries"
import { rowsOf, type Executor } from "./teacherSyllabusQueries"

const FORWARDED = 599

async function revisionByKey(executor: Executor, syllabusId: string, key: string) {
  const [row] = await rowsOf<{ id: string; number: number; submitted_by: string }>(
    executor,
    sql`select revision_silabo_id::text as id, numero_revision as number, enviado_por::text as submitted_by from revisiones_silabo
      where silabo_id = ${syllabusId}::uuid and clave_solicitud = ${key}::uuid limit 1`,
  )
  return row ? { id: row.id, number: Number(row.number), submittedBy: row.submitted_by } : null
}

function submissionTx(executor: Executor, notifications: SubmissionTx["notifications"]): SubmissionTx {
  const recipients = recipientsOn(executor)
  return {
    ...signatureTxOn(executor),
    notifications,
    librarians: () => recipients.librarians(),
    async lockSyllabus(id) {
      const [row] = await rowsOf<{ id: string; state: string; version: number }>(
        executor,
        sql`select silabo_id::text as id, estado_silabo as state, version_borrador as version from silabos
          where silabo_id = ${id}::uuid and exists (select 1 from convocatorias_carreras convocatoria where convocatoria.convocatoria_carrera_id = silabos.convocatoria_carrera_id)
          limit 1 for update of silabos`,
      )
      return row ? { id: row.id, state: row.state, version: Number(row.version) } : null
    },
    revisionByKey: (syllabusId, key) => revisionByKey(executor, syllabusId, key),
    async lockLatestRevision(syllabusId) {
      const [row] = await rowsOf<{ id: string; number: number; stage: string | null }>(
        executor,
        sql`select revision_silabo_id::text as id, numero_revision as number, correccion_etapa as stage from revisiones_silabo
          where silabo_id = ${syllabusId}::uuid order by numero_revision desc limit 1 for update`,
      )
      return row ? { id: row.id, number: Number(row.number), correctionStage: row.stage } : null
    },
    snapshot: (syllabusId) => buildSyllabusSnapshot(syllabusId, snapshotSourceOn(executor)),
    async createRevision(row) {
      await executor.execute(sql`insert into revisiones_silabo (revision_silabo_id, silabo_id, revision_anterior_id, numero_revision, clave_solicitud,
          version_borrador, contenido_enviado, hash_contenido, enviado_por, enviado_en)
        values (${row.id}::uuid, ${row.syllabusId}::uuid, ${row.previousId}::uuid, ${row.number}, ${row.key}::uuid, ${row.version},
          ${canonicalJson(row.snapshot)}::jsonb, ${row.fingerprint}, ${row.submittedBy}::uuid, to_timestamp(${row.submittedAt}))`)
    },
    async lastVerification(syllabusId) {
      const [row] = await rowsOf<{ verified_by: string | null; verified_at: string; snapshot: string | null }>(
        executor,
        sql`select envio.verificado_por::text as verified_by, extract(epoch from envio.verificado_en)::bigint as verified_at, revision.contenido_enviado::text as snapshot
          from envios_biblioteca envio inner join revisiones_silabo revision on revision.revision_silabo_id = envio.revision_silabo_id
          where revision.silabo_id = ${syllabusId}::uuid and envio.verificado_en is not null order by revision.numero_revision desc limit 1`,
      )
      if (!row) return null
      if (hasAmbiguousNumbers(row.snapshot)) throw new NeedsLaravel()
      return { verifiedBy: row.verified_by ?? "", verifiedAt: Number(row.verified_at), snapshot: phpJsonDecode(row.snapshot) }
    },
    async createLibrarySubmission(row) {
      await executor.execute(sql`insert into envios_biblioteca (envio_biblioteca_id, revision_silabo_id, verificado_por, verificado_en, verificacion_heredada)
        values (${uuid7()}::uuid, ${row.revisionId}::uuid, ${row.verifiedBy}::uuid,
          ${row.verifiedAt === null ? null : sql`to_timestamp(${row.verifiedAt})`}, ${row.inherited})`)
    },
    async markSubmitted(syllabusId, version, at) {
      await executor.execute(sql`update silabos set estado_silabo = 'en_revision', version_borrador = ${version}, guardado_en = to_timestamp(${at})
        where silabo_id = ${syllabusId}::uuid`)
    },
  }
}

export function submissionDepsOn(
  executor: Executor,
  transaction: TransactionRunner,
  options: WriteOptions & { bridge?: BridgeDeps } = {},
): Pick<SubmissionDeps, "store" | "validate" | "payload"> {
  const now = options.now ?? systemNow
  const detail = syllabusDetailStoreOn(executor)
  const store: SubmissionStore = {
    syllabus: (id, userId) => detail.syllabus(id, userId),
    async schedule(syllabusId) {
      const [row] = await rowsOf<{ convocation_state: string; process_state: string; starts_on: string; due_on: string }>(
        executor,
        sql`select convocatoria.estado_convocatoria_carrera as convocation_state, proceso.estado_convocatoria_universidad as process_state,
            ${institutionDateSql(sql.raw("proceso.fecha_inicio"))} as starts_on, ${institutionDateSql(sql.raw("proceso.fecha_entrega"))} as due_on
          from silabos inner join convocatorias_carreras convocatoria on convocatoria.convocatoria_carrera_id = silabos.convocatoria_carrera_id
            inner join convocatorias_universidad proceso on proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id
          where silabos.silabo_id = ${syllabusId}::uuid limit 1`,
      )
      return row ? { convocationState: row.convocation_state, processState: row.process_state, startsOn: row.starts_on, dueOn: row.due_on } : null
    },
    revisionByKey: (syllabusId, key) => revisionByKey(executor, syllabusId, key),
    signed: (syllabusId, role) => signatureTxOn(executor).signed(syllabusId, role),
    snapshot: (syllabusId) => buildSyllabusSnapshot(syllabusId, snapshotSourceOn(executor)),
    async userName(id) {
      const [row] = await rowsOf<{ name: string }>(executor, sql`select nombre_usuario as name from usuarios where usuario_id = ${id}::uuid limit 1`)
      return row?.name ?? ""
    },
    transaction: (work) =>
      withAfterCommit((afterCommit) => transaction((inner) => work(submissionTx(inner, notificationScope(inner, afterCommit, now(), options.mail))))),
  }
  return {
    store,
    async validate(request, syllabusId) {
      const bridge = { ...(options.bridge ?? defaultBridgeDeps()), forward: async () => new Response(null, { status: FORWARDED }) }
      const validation = draftValidationStoreOn(executor, (work) => transaction((inner) => work(validationTx(inner))))
      const response = await validateDraft(request.clone(), syllabusId, { bridge, store: validation, today: institutionToday })
      if (response.status !== 200) return null
      const body = (await response.json()) as { validation: { blocking_errors: number } }
      return body.validation.blocking_errors
    },
    async payload(request, session, syllabusId) {
      const syllabus = await detail.syllabus(syllabusId, session.user.id)
      if (syllabus === null) throw new Error("El sílabo enviado dejó de existir.")
      const deps = { bridge: defaultBridgeDeps(), store: detail, templates: createTemplateStore(executor), logos: createLogoStore(executor), today: institutionToday }
      return (await syllabusPayload(request, session, syllabus, deps)) as PhpRecord
    },
  }
}

export function createSubmissionDeps(): Pick<SubmissionDeps, "store" | "validate" | "payload"> {
  return submissionDepsOn(db as unknown as Executor, dbTransaction)
}
