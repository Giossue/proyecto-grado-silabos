import { Prisma } from "../../generated/prisma/client"
import { inTransaction } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import { fromEpoch, jsonbValue, jsonText, uuidList } from "../../prisma/sql"
import { uuid7 } from "../http/uuid7"
import { phpJsonDecode, phpShape } from "../configuration/phpValues"
import { createTemplateStore } from "../shared/templateStore"
import type { DraftStartTx } from "./draftStart"
import { draftTx } from "./draftFieldStore"
import { syllabusDetailStoreOn } from "./syllabusDetailQueries"
import { SYLLABUS_EXISTS, writtenBySql } from "./syllabusSql"
import { carryTeacherFields } from "./teacherFields"
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
        Prisma.sql`select silabos.silabo_id::text as id from silabos inner join paralelos paralelo on paralelo.paralelo_id = silabos.paralelo_id
          where silabos.silabo_id != ${syllabusId}::uuid and silabos.iniciado_en is not null and paralelo.asignatura_id = ${subjectId}::uuid
            and exists (select 1 from convocatorias_carreras cerrada where cerrada.convocatoria_carrera_id = silabos.convocatoria_carrera_id
              and cerrada.estado_convocatoria_carrera = 'cerrado'
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
        Prisma.sql`select definiciones_campo.definicion_campo_id as id, definiciones_campo.quien_llena_definicion_campo as responsible,
            ${jsonText(Prisma.raw("definiciones_campo.contenido_definicion_campo"))} as content
          from definiciones_campo
          where definiciones_campo.plantilla_id = ${templateId}::uuid and definiciones_campo.vigente_en_plantilla = true
            and definiciones_campo.quien_llena_definicion_campo <> 'institucional'`,
      )
      return rows.map((row) => ({ id: row.id, responsible: row.responsible, content: phpJsonDecode(row.content) }))
    },
    async values(syllabusId, fieldIds) {
      if (fieldIds.length === 0) return []
      const rows = await rowsOf<{ fieldId: string; value: string | null }>(
        executor,
        Prisma.sql`select valores_campo.definicion_campo_id as "fieldId", ${jsonText(Prisma.raw("valores_campo.valor_campo"))} as value
          from valores_campo where valores_campo.silabo_id = ${syllabusId}::uuid and valores_campo.definicion_campo_id in (${uuidList(fieldIds)})`,
      )
      return rows.map((row) => ({ fieldId: row.fieldId, value: phpJsonDecode(row.value) }))
    },
    async deleteValues(syllabusId, fieldIds) {
      if (fieldIds.length === 0) return
      await executor.$executeRaw`delete from valores_campo where valores_campo.silabo_id = ${syllabusId}::uuid and valores_campo.definicion_campo_id in (${uuidList(fieldIds)})`
    },
    async insertValue(syllabusId, fieldId, document, fingerprint) {
      await executor.$executeRaw`insert into valores_campo (valor_campo_id, silabo_id, definicion_campo_id, valor_campo, huella_definicion_campo)
        values (${uuid7()}::uuid, ${syllabusId}::uuid, ${fieldId}::uuid, ${jsonbValue(JSON.stringify(phpShape(document)))}, ${fingerprint})`
    },
    carryTeacherFields: (syllabusId, template) => carryTeacherFields(executor, syllabusId, template, uuid7),
    async start(syllabusId, now) {
      await executor.$executeRaw`update silabos set iniciado_en = ${fromEpoch(now)}, guardado_en = ${fromEpoch(now)}, version_borrador = 1
        where silabos.silabo_id = ${syllabusId}::uuid`
    },
    async copied(syllabusId, version, now) {
      await executor.$executeRaw`update silabos set estado_silabo = 'borrador', iniciado_en = coalesce(silabos.iniciado_en, ${fromEpoch(now)}), guardado_en = ${fromEpoch(now)},
          version_borrador = ${version}
        where silabos.silabo_id = ${syllabusId}::uuid`
    },
  }
}

export function createDraftStartStore(prisma: PrismaService) {
  return {
    detail: syllabusDetailStoreOn(prisma),
    transaction: <T>(work: (tx: DraftStartTx) => Promise<T>): Promise<T> => inTransaction(prisma, (tx) => work(draftStartTx(tx))),
  }
}
