import "server-only"
import { and, eq, inArray, ne, sql } from "drizzle-orm"
import { db } from "@/db"
import { fromEpoch } from "@/db/expressions"
import { definicionesCampo, silabos, valoresCampo } from "@/db/schema"
import { uuid7 } from "../http/uuid7"
import { phpJsonDecode, phpShape } from "../configuration/phpValues"
import { createTemplateStore } from "../configuration/templateStore"
import type { DraftStartTx } from "./draftStart"
import { draftTx } from "./draftFieldStore"
import { syllabusDetailStoreOn } from "./syllabusDetailQueries"
import { SYLLABUS_EXISTS, writtenBySql } from "./syllabusSql"
import { rowsOf, type Executor } from "./teacherSyllabusQueries"
import { jsonbValue, jsonText } from "@/db/expressions"

export function draftStartTx(executor: Executor): DraftStartTx {
  const draft = draftTx(executor)
  return {
    detail: syllabusDetailStoreOn(executor),
    templateStore: createTemplateStore(executor),
    lockSyllabus: (id) => draft.lockSyllabus(id),
    async previousPeriodSource(syllabusId, subjectId, userId, templateModifiedAt) {
      const [row] = await rowsOf<{ id: string }>(
        executor,
        sql`select silabos.silabo_id::text as id from silabos inner join paralelos paralelo on paralelo.paralelo_id = silabos.paralelo_id
          where silabos.silabo_id != ${syllabusId}::uuid and silabos.iniciado_en is not null and paralelo.asignatura_id = ${subjectId}::uuid
            and exists (select 1 from convocatorias_carreras cerrada where cerrada.convocatoria_carrera_id = silabos.convocatoria_carrera_id
              and cerrada.estado_convocatoria_carrera = 'cerrada'
              and exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = cerrada.convocatoria_universidad_id))
            and ${writtenBySql(userId)} and ${SYLLABUS_EXISTS}
            and (${templateModifiedAt}::timestamptz is null or ${templateModifiedAt}::timestamptz <= silabos.iniciado_en)
          order by silabos.iniciado_en desc limit 1`,
      )
      return row?.id ?? null
    },
    async teacherFields(templateId) {
      const rows = await executor
        .select({ id: definicionesCampo.definicionCampoId, responsible: definicionesCampo.quienLlenaDefinicionCampo, content: jsonText(definicionesCampo.contenidoDefinicionCampo) })
        .from(definicionesCampo)
        .where(
          and(eq(definicionesCampo.plantillaId, templateId), eq(definicionesCampo.vigenteEnPlantilla, true), ne(definicionesCampo.quienLlenaDefinicionCampo, "institucional")),
        )
      return rows.map((row) => ({ id: row.id, responsible: row.responsible, content: phpJsonDecode(row.content) }))
    },
    async values(syllabusId, fieldIds) {
      if (fieldIds.length === 0) return []
      const rows = await executor
        .select({ fieldId: valoresCampo.definicionCampoId, value: jsonText(valoresCampo.valorCampo) })
        .from(valoresCampo)
        .where(and(eq(valoresCampo.silaboId, syllabusId), inArray(valoresCampo.definicionCampoId, fieldIds)))
      return rows.map((row) => ({ fieldId: row.fieldId, value: phpJsonDecode(row.value) }))
    },
    async deleteValues(syllabusId, fieldIds) {
      if (fieldIds.length === 0) return
      await executor.delete(valoresCampo).where(and(eq(valoresCampo.silaboId, syllabusId), inArray(valoresCampo.definicionCampoId, fieldIds)))
    },
    async insertValue(syllabusId, fieldId, document) {
      await executor.insert(valoresCampo).values({ silaboId: syllabusId, definicionCampoId: fieldId, valorCampo: jsonbValue(JSON.stringify(phpShape(document))), valorCampoId: uuid7() })
    },
    async start(syllabusId, now) {
      await executor
        .update(silabos)
        .set({ estadoSilabo: "borrador", iniciadoEn: fromEpoch(now), guardadoEn: fromEpoch(now), versionBorrador: 1 })
        .where(eq(silabos.silaboId, syllabusId))
    },
    async copied(syllabusId, version, now) {
      await executor
        .update(silabos)
        .set({ estadoSilabo: "borrador", iniciadoEn: sql`coalesce(${silabos.iniciadoEn}, ${fromEpoch(now)})`, guardadoEn: fromEpoch(now), versionBorrador: version })
        .where(eq(silabos.silaboId, syllabusId))
    },
  }
}

export function createDraftStartStore() {
  return {
    detail: syllabusDetailStoreOn(db as unknown as Executor),
    transaction: <T>(work: (tx: DraftStartTx) => Promise<T>): Promise<T> => db.transaction((tx) => work(draftStartTx(tx as unknown as Executor))),
  }
}
