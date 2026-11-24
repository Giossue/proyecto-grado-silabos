import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { phpJsonEncode } from "../laravel/phpJson"
import { uuidList } from "../laravel/sql"
import { uuid7 } from "../laravel/uuid7"
import { insertAuditEvent } from "../operations/recordAuditEvent"
import { phpJsonDecode, phpShape } from "../configuration/phpValues"
import { createTemplateStore } from "../configuration/templateStore"
import type { DraftStartTx } from "./draftStart"
import { draftTx } from "./draftFieldStore"
import { syllabusDetailStoreOn } from "./syllabusDetailQueries"
import { SYLLABUS_EXISTS, writtenBySql } from "./syllabusSql"
import { rowsOf, type Executor } from "./teacherSyllabusQueries"

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
      const rows = await rowsOf<{ id: string; responsible: string; content: string | null }>(
        executor,
        sql`select definicion_campo_id::text as id, quien_llena_definicion_campo as responsible, contenido_definicion_campo::text as content
          from definiciones_campo where plantilla_id = ${templateId}::uuid and vigente_en_plantilla = true and quien_llena_definicion_campo != 'institucional'`,
      )
      return rows.map((row) => ({ id: row.id, responsible: row.responsible, content: phpJsonDecode(row.content) }))
    },
    async values(syllabusId, fieldIds) {
      if (fieldIds.length === 0) return []
      const rows = await rowsOf<{ field_id: string; value: string | null }>(
        executor,
        sql`select definicion_campo_id::text as field_id, valor_campo::text as value from valores_campo
          where silabo_id = ${syllabusId}::uuid and definicion_campo_id in (${uuidList(fieldIds)})`,
      )
      return rows.map((row) => ({ fieldId: row.field_id, value: phpJsonDecode(row.value) }))
    },
    async deleteValues(syllabusId, fieldIds) {
      if (fieldIds.length === 0) return
      await executor.execute(sql`delete from valores_campo where silabo_id = ${syllabusId}::uuid and definicion_campo_id in (${uuidList(fieldIds)})`)
    },
    async insertValue(syllabusId, fieldId, document) {
      await executor.execute(sql`insert into valores_campo (silabo_id, definicion_campo_id, valor_campo, valor_campo_id)
        values (${syllabusId}::uuid, ${fieldId}::uuid, ${phpJsonEncode(phpShape(document))}::jsonb, ${uuid7()}::uuid)`)
    },
    async start(syllabusId, now) {
      await executor.execute(sql`update silabos set estado_silabo = 'borrador', iniciado_en = to_timestamp(${now}), guardado_en = to_timestamp(${now}),
        version_borrador = 1 where silabo_id = ${syllabusId}::uuid`)
    },
    async copied(syllabusId, version, now) {
      await executor.execute(sql`update silabos set estado_silabo = 'borrador', iniciado_en = coalesce(iniciado_en, to_timestamp(${now})),
        guardado_en = to_timestamp(${now}), version_borrador = ${version} where silabo_id = ${syllabusId}::uuid`)
    },
    async recordAudit(event) {
      await insertAuditEvent(executor, event)
    },
  }
}

export function createDraftStartStore() {
  return {
    detail: syllabusDetailStoreOn(db as unknown as Executor),
    transaction: <T>(work: (tx: DraftStartTx) => Promise<T>): Promise<T> => db.transaction((tx) => work(draftStartTx(tx as unknown as Executor))),
  }
}
