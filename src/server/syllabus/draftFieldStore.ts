import "server-only"
import { and, eq, exists, sql } from "drizzle-orm"
import { db } from "@/db"
import { fromEpoch, hasRows, jsonbValue, jsonText } from "@/db/expressions"
import {
  camposPlantilla,
  convocatoriasCarreras,
  convocatoriasUniversidad,
  definicionesCampo,
  docentesVigentesSilabo,
  enviosBiblioteca,
  paralelos,
  revisionesSilabo,
  silabos,
  usuarios,
  valoresCampo,
} from "@/db/schema"
import { institutionDateSql } from "../http/sql"
import { phpShape } from "../configuration/phpValues"
import { phpJsonDecode } from "../configuration/phpValues"
import { createTemplateStore } from "../configuration/templateStore"
import type { DraftFieldRecord, DraftFieldStore, DraftFieldTx, DraftSyllabus } from "./draftField"
import type { IdentificationSource } from "./identificationCard"
import { currentTeacherSql, SYLLABUS_EXISTS, writtenBySql } from "./syllabusSql"
import type { Executor } from "./teacherSyllabusQueries"

export async function syllabusFacts(executor: Executor, id: string, userId: string): Promise<DraftSyllabus | null> {
  const [row] = await executor
    .select({
      id: silabos.silaboId,
      state: silabos.estadoSilabo,
      careerId: convocatoriasCarreras.carreraId,
      convocationState: convocatoriasCarreras.estadoConvocatoriaCarrera,
      processState: convocatoriasUniversidad.estadoConvocatoriaUniversidad,
      dueOn: sql<string>`${institutionDateSql(sql`${convocatoriasUniversidad.fechaEntrega}`)}`,
      currentTeacher: sql<boolean>`${currentTeacherSql(userId)}`,
      writtenByUser: sql<boolean>`${writtenBySql(userId)}`,
      hasLibrarySubmission: sql<boolean>`${exists(
        executor
          .select({ id: enviosBiblioteca.envioBibliotecaId })
          .from(enviosBiblioteca)
          .innerJoin(revisionesSilabo, eq(revisionesSilabo.revisionSilaboId, enviosBiblioteca.revisionSilaboId))
          .where(eq(revisionesSilabo.silaboId, silabos.silaboId)),
      )}`,
      subjectId: paralelos.asignaturaId,
    })
    .from(silabos)
    .innerJoin(convocatoriasCarreras, eq(convocatoriasCarreras.convocatoriaCarreraId, silabos.convocatoriaCarreraId))
    .innerJoin(convocatoriasUniversidad, eq(convocatoriasUniversidad.convocatoriaUniversidadId, convocatoriasCarreras.convocatoriaUniversidadId))
    .innerJoin(paralelos, eq(paralelos.paraleloId, silabos.paraleloId))
    .where(eq(silabos.silaboId, id))
    .limit(1)
  return row ?? null
}

export async function identificationSource(executor: Executor, syllabusId: string): Promise<IdentificationSource> {
  const [syllabus] = await executor
    .select({ context: jsonText(silabos.datosAcademicosSilabo), code: paralelos.codigoParalelo, shift: paralelos.jornadaParalelo })
    .from(silabos)
    .leftJoin(paralelos, eq(paralelos.paraleloId, silabos.paraleloId))
    .where(eq(silabos.silaboId, syllabusId))
    .limit(1)
  const teachers = await executor
    .select({ name: usuarios.nombreUsuario, email: usuarios.correoElectronico, formation: usuarios.formacionExperienciaUsuario })
    .from(usuarios)
    .innerJoin(docentesVigentesSilabo, eq(usuarios.usuarioId, docentesVigentesSilabo.usuarioId))
    .where(eq(docentesVigentesSilabo.silaboId, syllabusId))
  return { context: phpJsonDecode(syllabus?.context ?? "[]"), parallelCode: syllabus?.code ?? null, parallelShift: syllabus?.shift ?? null, teachers }
}

function syllabusValue(syllabusId: string, fieldId: string) {
  return and(eq(valoresCampo.silaboId, syllabusId), eq(valoresCampo.definicionCampoId, fieldId))
}

function draftTx(executor: Executor): DraftFieldTx {
  return {
    async lockSyllabus(id) {
      const [row] = await executor
        .select({
          id: silabos.silaboId,
          state: silabos.estadoSilabo,
          version: silabos.versionBorrador,
          subjectId: sql<string>`(${executor.select({ id: paralelos.asignaturaId }).from(paralelos).where(eq(paralelos.paraleloId, silabos.paraleloId))})`,
        })
        .from(silabos)
        .where(and(eq(silabos.silaboId, id), SYLLABUS_EXISTS))
        .limit(1)
        .for("update")
      return row ? { id: row.id, state: row.state, version: Number(row.version), subjectId: row.subjectId } : null
    },
    templateStore: createTemplateStore(executor),
    async values(syllabusId) {
      const rows = await executor
        .select({ fieldId: valoresCampo.definicionCampoId, value: jsonText(valoresCampo.valorCampo) })
        .from(valoresCampo)
        .where(eq(valoresCampo.silaboId, syllabusId))
      return new Map(rows.map((row) => [row.fieldId, phpJsonDecode(row.value)]))
    },
    valueExists: (syllabusId, fieldId) =>
      hasRows(executor.select({ id: valoresCampo.valorCampoId }).from(valoresCampo).where(syllabusValue(syllabusId, fieldId)).limit(1)),
    async saveValue(syllabusId, fieldId, document, newId) {
      const value = jsonbValue(JSON.stringify(phpShape(document)))
      const [existing] = await executor.select({ id: valoresCampo.valorCampoId }).from(valoresCampo).where(syllabusValue(syllabusId, fieldId)).limit(1)
      if (existing) {
        await executor.update(valoresCampo).set({ valorCampo: value }).where(eq(valoresCampo.valorCampoId, existing.id))
        return
      }
      await executor.insert(valoresCampo).values({ silaboId: syllabusId, definicionCampoId: fieldId, valorCampo: value, valorCampoId: newId })
    },
    async saveDraft(syllabusId, version, savedAt) {
      await executor.update(silabos).set({ versionBorrador: version, guardadoEn: fromEpoch(savedAt) }).where(eq(silabos.silaboId, syllabusId))
    },
  }
}

export function draftFieldStoreOn(executor: Executor, transaction: <T>(work: (tx: DraftFieldTx) => Promise<T>) => Promise<T>): DraftFieldStore {
  return {
    syllabus: (id, userId) => syllabusFacts(executor, id, userId),
    async field(id) {
      const [row] = await executor
        .select({
          id: definicionesCampo.definicionCampoId,
          templateId: definicionesCampo.plantillaId,
          responsible: definicionesCampo.quienLlenaDefinicionCampo,
          content: jsonText(definicionesCampo.contenidoDefinicionCampo),
          key: sql<string>`coalesce(${camposPlantilla.claveCampoPlantilla}, '')`,
          live: definicionesCampo.vigenteEnPlantilla,
        })
        .from(definicionesCampo)
        .leftJoin(camposPlantilla, eq(camposPlantilla.campoPlantillaId, definicionesCampo.campoPlantillaId))
        .where(eq(definicionesCampo.definicionCampoId, id))
        .limit(1)
      if (!row) return null
      const record: DraftFieldRecord = { ...row, content: phpJsonDecode(row.content) }
      return record
    },
    transaction,
    async storedValue(syllabusId, fieldId) {
      const [row] = await executor.select({ value: jsonText(valoresCampo.valorCampo) }).from(valoresCampo).where(syllabusValue(syllabusId, fieldId)).limit(1)
      return row ? phpJsonDecode(row.value) : null
    },
    identification: (syllabusId) => identificationSource(executor, syllabusId),
  }
}

export function createDraftFieldStore(): DraftFieldStore {
  return draftFieldStoreOn(db, (work) => db.transaction((tx) => work(draftTx(tx))))
}

export { draftTx }
