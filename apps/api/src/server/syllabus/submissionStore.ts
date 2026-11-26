import { Prisma } from "../../generated/prisma/client"
import type { PrismaService } from "../../prisma/prisma.service"
import { epochText, fromEpoch, institutionDateSql, jsonbValue, jsonText } from "../../prisma/sql"
import { defaultBridgeDeps } from "../auth/requireSession"
import type { BridgeDeps } from "../auth/types"
import { phpJsonDecode, type PhpRecord } from "../configuration/phpValues"
import { canonicalJson } from "../documents/canonicalJson"
import { buildSyllabusSnapshot } from "../documents/syllabusSnapshot"
import { snapshotSourceOn } from "../documents/syllabusSnapshotStore"
import { uuid7 } from "../http/uuid7"
import { institutionToday, systemNow } from "../shared/clock"
import { createLogoStore } from "../shared/logoStore"
import { createTemplateStore } from "../shared/templateStore"
import { notificationScope, recipientsOn, type WriteOptions } from "../notifications/queries"
import { withAfterCommit } from "../queue/dispatch"
import { signatureTxOn } from "../signatures/signatureStore"
import { validateDraft } from "./draftValidation"
import { draftValidationStoreOn, validationTx } from "./draftValidationQueries"
import { dbTransaction, type TransactionRunner } from "./reviewDecisionStore"
import type { SubmissionDeps, SubmissionStore, SubmissionTx } from "./submission"
import { syllabusPayload } from "./syllabusDetail"
import { syllabusDetailStoreOn } from "./syllabusDetailQueries"
import { rowsOf, type Executor } from "./teacherSyllabusQueries"

async function revisionByKey(executor: Executor, syllabusId: string, key: string) {
  const [row] = await rowsOf<{ id: string; number: number; submittedBy: string }>(
    executor,
    Prisma.sql`select revisiones_silabo.revision_silabo_id as id, revisiones_silabo.numero_revision as number, revisiones_silabo.enviado_por as "submittedBy"
      from revisiones_silabo where revisiones_silabo.silabo_id = ${syllabusId}::uuid and revisiones_silabo.clave_solicitud = ${key}::uuid limit 1`,
  )
  return row ? { ...row, number: Number(row.number) } : null
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
        Prisma.sql`select silabos.silabo_id as id, silabos.estado_silabo as state, silabos.version_borrador as version from silabos
          where silabos.silabo_id = ${id}::uuid
            and exists (select convocatorias_carreras.convocatoria_carrera_id from convocatorias_carreras
              where convocatorias_carreras.convocatoria_carrera_id = silabos.convocatoria_carrera_id)
          limit 1 for update of silabos`,
      )
      return row ? { id: row.id, state: row.state, version: Number(row.version) } : null
    },
    revisionByKey: (syllabusId, key) => revisionByKey(executor, syllabusId, key),
    async lockLatestRevision(syllabusId) {
      const [row] = await rowsOf<{ id: string; number: number; stage: string | null }>(
        executor,
        Prisma.sql`select revisiones_silabo.revision_silabo_id as id, revisiones_silabo.numero_revision as number, revisiones_silabo.correccion_etapa as stage
          from revisiones_silabo where revisiones_silabo.silabo_id = ${syllabusId}::uuid
          order by revisiones_silabo.numero_revision desc limit 1 for update`,
      )
      return row ? { id: row.id, number: Number(row.number), correctionStage: row.stage } : null
    },
    snapshot: (syllabusId) => buildSyllabusSnapshot(syllabusId, snapshotSourceOn(executor)),
    async createRevision(row) {
      await executor.$executeRaw`insert into revisiones_silabo (revision_silabo_id, silabo_id, revision_anterior_id, numero_revision, clave_solicitud,
          version_borrador, contenido_enviado, hash_contenido, enviado_por, enviado_en)
        values (${row.id}::uuid, ${row.syllabusId}::uuid, ${row.previousId}::uuid, ${row.number}, ${row.key}::uuid,
          ${row.version}, ${jsonbValue(canonicalJson(row.snapshot))}, ${row.fingerprint}, ${row.submittedBy}::uuid, ${fromEpoch(row.submittedAt)})`
    },
    async lastVerification(syllabusId) {
      const [row] = await rowsOf<{ verifiedBy: string | null; verifiedAt: string | null; snapshot: string | null }>(
        executor,
        Prisma.sql`select envios_biblioteca.verificado_por as "verifiedBy", ${epochText(Prisma.raw("envios_biblioteca.verificado_en"))} as "verifiedAt",
            ${jsonText(Prisma.raw("revisiones_silabo.contenido_enviado"))} as snapshot
          from envios_biblioteca inner join revisiones_silabo on revisiones_silabo.revision_silabo_id = envios_biblioteca.revision_silabo_id
          where revisiones_silabo.silabo_id = ${syllabusId}::uuid and envios_biblioteca.verificado_en is not null
          order by revisiones_silabo.numero_revision desc limit 1`,
      )
      if (!row) return null
      return { verifiedBy: row.verifiedBy ?? "", verifiedAt: Number(row.verifiedAt), snapshot: phpJsonDecode(row.snapshot) }
    },
    async createLibrarySubmission(row) {
      await executor.$executeRaw`insert into envios_biblioteca (envio_biblioteca_id, revision_silabo_id, verificado_por, verificado_en, verificacion_heredada)
        values (${uuid7()}::uuid, ${row.revisionId}::uuid, ${row.verifiedBy}::uuid, ${row.verifiedAt === null ? null : fromEpoch(row.verifiedAt)}, ${row.inherited})`
    },
    async markSubmitted(syllabusId, version, at) {
      await executor.$executeRaw`update silabos set estado_silabo = 'en_revision', version_borrador = ${version}, guardado_en = ${fromEpoch(at)}
        where silabos.silabo_id = ${syllabusId}::uuid`
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
      const [row] = await rowsOf<{ convocationState: string; processState: string; startsOn: string; dueOn: string }>(
        executor,
        Prisma.sql`select convocatorias_carreras.estado_convocatoria_carrera as "convocationState",
            convocatorias_universidad.estado_convocatoria_universidad as "processState",
            ${institutionDateSql(Prisma.raw("convocatorias_universidad.fecha_inicio"))} as "startsOn",
            ${institutionDateSql(Prisma.raw("convocatorias_universidad.fecha_entrega"))} as "dueOn"
          from silabos
            inner join convocatorias_carreras on convocatorias_carreras.convocatoria_carrera_id = silabos.convocatoria_carrera_id
            inner join convocatorias_universidad on convocatorias_universidad.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id
          where silabos.silabo_id = ${syllabusId}::uuid limit 1`,
      )
      return row ?? null
    },
    revisionByKey: (syllabusId, key) => revisionByKey(executor, syllabusId, key),
    signed: (syllabusId, role) => signatureTxOn(executor).signed(syllabusId, role),
    snapshot: (syllabusId) => buildSyllabusSnapshot(syllabusId, snapshotSourceOn(executor)),
    async userName(id) {
      const [row] = await rowsOf<{ name: string }>(executor, Prisma.sql`select usuarios.nombre_usuario as name from usuarios where usuarios.usuario_id = ${id}::uuid limit 1`)
      return row?.name ?? ""
    },
    transaction: (work) =>
      withAfterCommit((afterCommit) => transaction((inner) => work(submissionTx(inner, notificationScope(inner, afterCommit, now(), options.mail))))),
  }
  return {
    store,
    async validate(request, syllabusId) {
      const bridge = options.bridge ?? defaultBridgeDeps()
      const validation = draftValidationStoreOn(executor, (work) => transaction((inner) => work(validationTx(inner))))
      const response = await validateDraft(request.clone(), syllabusId, { bridge, store: validation, today: institutionToday })
      if (response.status !== 200) return response
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

export function createSubmissionDeps(prisma: PrismaService): Pick<SubmissionDeps, "store" | "validate" | "payload"> {
  return submissionDepsOn(prisma, dbTransaction(prisma))
}
