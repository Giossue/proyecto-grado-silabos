import { and, desc, eq, exists, isNotNull, sql } from "drizzle-orm"
import { db } from "@/db"
import { epochText, fromEpoch, jsonbValue, jsonText } from "@/db/expressions"
import { convocatoriasCarreras, convocatoriasUniversidad, enviosBiblioteca, revisionesSilabo, silabos, usuarios } from "@/db/schema"
import { defaultBridgeDeps } from "../auth/requireSession"
import type { BridgeDeps } from "../auth/types"
import { createLogoStore } from "../configuration/institutionalLogos"
import { createTemplateStore } from "../configuration/templateStore"
import { phpJsonDecode, type PhpRecord } from "../configuration/phpValues"
import { canonicalJson } from "../documents/canonicalJson"
import { buildSyllabusSnapshot } from "../documents/syllabusSnapshot"
import { snapshotSourceOn } from "../documents/syllabusSnapshotStore"
import { institutionDateSql } from "../http/sql"
import { uuid7 } from "../http/uuid7"
import { institutionToday, systemNow } from "../shared/clock"
import { notificationScope, recipientsOn, type WriteOptions } from "../notifications/queries"
import { withAfterCommit } from "../queue/dispatch"
import { signatureTxOn } from "../signatures/signatureStore"
import { validateDraft } from "./draftValidation"
import { draftValidationStoreOn, validationTx } from "./draftValidationQueries"
import { dbTransaction, type TransactionRunner } from "./reviewDecisionStore"
import type { SubmissionDeps, SubmissionStore, SubmissionTx } from "./submission"
import { syllabusPayload } from "./syllabusDetail"
import { syllabusDetailStoreOn } from "./syllabusDetailQueries"
import type { Executor } from "./teacherSyllabusQueries"


async function revisionByKey(executor: Executor, syllabusId: string, key: string) {
  const [row] = await executor
    .select({ id: revisionesSilabo.revisionSilaboId, number: revisionesSilabo.numeroRevision, submittedBy: revisionesSilabo.enviadoPor })
    .from(revisionesSilabo)
    .where(and(eq(revisionesSilabo.silaboId, syllabusId), eq(revisionesSilabo.claveSolicitud, key)))
    .limit(1)
  return row ? { ...row, number: Number(row.number) } : null
}

function submissionTx(executor: Executor, notifications: SubmissionTx["notifications"]): SubmissionTx {
  const recipients = recipientsOn(executor)
  return {
    ...signatureTxOn(executor),
    notifications,
    librarians: () => recipients.librarians(),
    async lockSyllabus(id) {
      const [row] = await executor
        .select({ id: silabos.silaboId, state: silabos.estadoSilabo, version: silabos.versionBorrador })
        .from(silabos)
        .where(
          and(
            eq(silabos.silaboId, id),
            exists(
              executor
                .select({ id: convocatoriasCarreras.convocatoriaCarreraId })
                .from(convocatoriasCarreras)
                .where(eq(convocatoriasCarreras.convocatoriaCarreraId, silabos.convocatoriaCarreraId)),
            ),
          ),
        )
        .limit(1)
        .for("update", { of: silabos })
      return row ? { id: row.id, state: row.state, version: Number(row.version) } : null
    },
    revisionByKey: (syllabusId, key) => revisionByKey(executor, syllabusId, key),
    async lockLatestRevision(syllabusId) {
      const [row] = await executor
        .select({ id: revisionesSilabo.revisionSilaboId, number: revisionesSilabo.numeroRevision, stage: revisionesSilabo.correccionEtapa })
        .from(revisionesSilabo)
        .where(eq(revisionesSilabo.silaboId, syllabusId))
        .orderBy(desc(revisionesSilabo.numeroRevision))
        .limit(1)
        .for("update")
      return row ? { id: row.id, number: Number(row.number), correctionStage: row.stage } : null
    },
    snapshot: (syllabusId) => buildSyllabusSnapshot(syllabusId, snapshotSourceOn(executor)),
    async createRevision(row) {
      await executor.insert(revisionesSilabo).values({
        revisionSilaboId: row.id,
        silaboId: row.syllabusId,
        revisionAnteriorId: row.previousId,
        numeroRevision: row.number,
        claveSolicitud: row.key,
        versionBorrador: row.version,
        contenidoEnviado: jsonbValue(canonicalJson(row.snapshot)),
        hashContenido: row.fingerprint,
        enviadoPor: row.submittedBy,
        enviadoEn: fromEpoch(row.submittedAt),
      })
    },
    async lastVerification(syllabusId) {
      const [row] = await executor
        .select({
          verifiedBy: enviosBiblioteca.verificadoPor,
          verifiedAt: epochText(enviosBiblioteca.verificadoEn),
          snapshot: jsonText(revisionesSilabo.contenidoEnviado),
        })
        .from(enviosBiblioteca)
        .innerJoin(revisionesSilabo, eq(revisionesSilabo.revisionSilaboId, enviosBiblioteca.revisionSilaboId))
        .where(and(eq(revisionesSilabo.silaboId, syllabusId), isNotNull(enviosBiblioteca.verificadoEn)))
        .orderBy(desc(revisionesSilabo.numeroRevision))
        .limit(1)
      if (!row) return null
      return { verifiedBy: row.verifiedBy ?? "", verifiedAt: Number(row.verifiedAt), snapshot: phpJsonDecode(row.snapshot) }
    },
    async createLibrarySubmission(row) {
      await executor.insert(enviosBiblioteca).values({
        envioBibliotecaId: uuid7(),
        revisionSilaboId: row.revisionId,
        verificadoPor: row.verifiedBy,
        verificadoEn: row.verifiedAt === null ? null : fromEpoch(row.verifiedAt),
        verificacionHeredada: row.inherited,
      })
    },
    async markSubmitted(syllabusId, version, at) {
      await executor
        .update(silabos)
        .set({ estadoSilabo: "en_revision", versionBorrador: version, guardadoEn: fromEpoch(at) })
        .where(eq(silabos.silaboId, syllabusId))
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
      const [row] = await executor
        .select({
          convocationState: convocatoriasCarreras.estadoConvocatoriaCarrera,
          processState: convocatoriasUniversidad.estadoConvocatoriaUniversidad,
          startsOn: sql<string>`${institutionDateSql(sql`${convocatoriasUniversidad.fechaInicio}`)}`,
          dueOn: sql<string>`${institutionDateSql(sql`${convocatoriasUniversidad.fechaEntrega}`)}`,
        })
        .from(silabos)
        .innerJoin(convocatoriasCarreras, eq(convocatoriasCarreras.convocatoriaCarreraId, silabos.convocatoriaCarreraId))
        .innerJoin(convocatoriasUniversidad, eq(convocatoriasUniversidad.convocatoriaUniversidadId, convocatoriasCarreras.convocatoriaUniversidadId))
        .where(eq(silabos.silaboId, syllabusId))
        .limit(1)
      return row ?? null
    },
    revisionByKey: (syllabusId, key) => revisionByKey(executor, syllabusId, key),
    signed: (syllabusId, role) => signatureTxOn(executor).signed(syllabusId, role),
    snapshot: (syllabusId) => buildSyllabusSnapshot(syllabusId, snapshotSourceOn(executor)),
    async userName(id) {
      const [row] = await executor.select({ name: usuarios.nombreUsuario }).from(usuarios).where(eq(usuarios.usuarioId, id)).limit(1)
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

export function createSubmissionDeps(): Pick<SubmissionDeps, "store" | "validate" | "payload"> {
  return submissionDepsOn(db, dbTransaction)
}
