import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { institutionDateSql } from "../laravel/sql"
import { phpJsonEncode } from "../laravel/phpJson"
import { phpShape } from "../configuration/phpValues"
import { phpJsonDecode } from "../configuration/phpValues"
import { createTemplateStore } from "../configuration/templateStore"
import type { DraftFieldRecord, DraftFieldStore, DraftFieldTx, DraftSyllabus } from "./draftField"
import type { IdentificationSource } from "./identificationCard"
import { currentTeacherSql, SYLLABUS_EXISTS, writtenBySql } from "./syllabusSql"
import { rowsOf, type Executor } from "./teacherSyllabusQueries"

type FactsRow = {
  id: string
  state: string
  career_id: string
  convocation_state: string
  process_state: string
  due_on: string
  current_teacher: boolean
  written_by_user: boolean
  has_library_submission: boolean
  subject_id: string
}

export async function syllabusFacts(executor: Executor, id: string, userId: string): Promise<DraftSyllabus | null> {
  const [row] = await rowsOf<FactsRow>(
    executor,
    sql`select silabos.silabo_id::text as id, silabos.estado_silabo as state, convocatoria.carrera_id::text as career_id,
        convocatoria.estado_convocatoria_carrera as convocation_state, proceso.estado_convocatoria_universidad as process_state,
        ${institutionDateSql(sql.raw("proceso.fecha_entrega"))} as due_on, ${currentTeacherSql(userId)} as current_teacher,
        ${writtenBySql(userId)} as written_by_user,
        exists (select 1 from envios_biblioteca envio inner join revisiones_silabo revision on revision.revision_silabo_id = envio.revision_silabo_id
          where revision.silabo_id = silabos.silabo_id) as has_library_submission,
        paralelo.asignatura_id::text as subject_id
      from silabos
        inner join convocatorias_carreras convocatoria on convocatoria.convocatoria_carrera_id = silabos.convocatoria_carrera_id
        inner join convocatorias_universidad proceso on proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id
        inner join paralelos paralelo on paralelo.paralelo_id = silabos.paralelo_id
      where silabos.silabo_id = ${id}::uuid limit 1`,
  )
  if (!row) return null
  return {
    id: row.id,
    state: row.state,
    careerId: row.career_id,
    convocationState: row.convocation_state,
    processState: row.process_state,
    dueOn: row.due_on,
    currentTeacher: row.current_teacher,
    writtenByUser: row.written_by_user,
    hasLibrarySubmission: row.has_library_submission,
    subjectId: row.subject_id,
  }
}

export async function identificationSource(executor: Executor, syllabusId: string): Promise<IdentificationSource> {
  const [syllabus] = await rowsOf<{ context: string; code: string | null; shift: string | null }>(
    executor,
    sql`select silabos.datos_academicos_silabo::text as context, paralelo.codigo_paralelo as code, paralelo.jornada_paralelo as shift
      from silabos left join paralelos paralelo on paralelo.paralelo_id = silabos.paralelo_id where silabos.silabo_id = ${syllabusId}::uuid limit 1`,
  )
  const teachers = await rowsOf<{ name: string | null; email: string | null; formation: string | null }>(
    executor,
    sql`select usuarios.nombre_usuario as name, usuarios.correo_electronico as email, usuarios.formacion_experiencia_usuario as formation
      from usuarios inner join docentes_vigentes_silabo on usuarios.usuario_id = docentes_vigentes_silabo.usuario_id
      where docentes_vigentes_silabo.silabo_id in (${syllabusId}::uuid)`,
  )
  return { context: phpJsonDecode(syllabus?.context ?? "[]"), parallelCode: syllabus?.code ?? null, parallelShift: syllabus?.shift ?? null, teachers }
}

function draftTx(executor: Executor): DraftFieldTx {
  return {
    async lockSyllabus(id) {
      const [row] = await rowsOf<{ id: string; state: string; version: number; subject_id: string }>(
        executor,
        sql`select silabos.silabo_id::text as id, silabos.estado_silabo as state, silabos.version_borrador as version,
            (select paralelo.asignatura_id::text from paralelos paralelo where paralelo.paralelo_id = silabos.paralelo_id) as subject_id
          from silabos where silabos.silabo_id = ${id}::uuid and ${SYLLABUS_EXISTS} limit 1 for update`,
      )
      return row ? { id: row.id, state: row.state, version: Number(row.version), subjectId: row.subject_id } : null
    },
    templateStore: createTemplateStore(executor),
    async values(syllabusId) {
      const rows = await rowsOf<{ field_id: string; value: string | null }>(
        executor,
        sql`select definicion_campo_id::text as field_id, valor_campo::text as value from valores_campo where silabo_id = ${syllabusId}::uuid`,
      )
      return new Map(rows.map((row) => [row.field_id, phpJsonDecode(row.value)]))
    },
    async valueExists(syllabusId, fieldId) {
      const [row] = await rowsOf<{ found: boolean }>(
        executor,
        sql`select exists (select 1 from valores_campo where silabo_id = ${syllabusId}::uuid and definicion_campo_id = ${fieldId}::uuid) as found`,
      )
      return row?.found === true
    },
    async saveValue(syllabusId, fieldId, document, newId) {
      const [existing] = await rowsOf<{ id: string }>(
        executor,
        sql`select valor_campo_id::text as id from valores_campo where silabo_id = ${syllabusId}::uuid and definicion_campo_id = ${fieldId}::uuid limit 1`,
      )
      if (existing) {
        await executor.execute(sql`update valores_campo set valor_campo = ${phpJsonEncode(phpShape(document))}::jsonb where valor_campo_id = ${existing.id}::uuid`)
        return
      }
      await executor.execute(sql`insert into valores_campo (silabo_id, definicion_campo_id, valor_campo, valor_campo_id)
        values (${syllabusId}::uuid, ${fieldId}::uuid, ${phpJsonEncode(phpShape(document))}::jsonb, ${newId}::uuid)`)
    },
    async saveDraft(syllabusId, version, savedAt) {
      await executor.execute(sql`update silabos set version_borrador = ${version}, guardado_en = to_timestamp(${savedAt}) where silabo_id = ${syllabusId}::uuid`)
    },
  }
}

export function draftFieldStoreOn(executor: Executor, transaction: <T>(work: (tx: DraftFieldTx) => Promise<T>) => Promise<T>): DraftFieldStore {
  return {
    syllabus: (id, userId) => syllabusFacts(executor, id, userId),
    async field(id) {
      const [row] = await rowsOf<{ id: string; template_id: string; responsible: string; content: string | null; key: string; live: boolean }>(
        executor,
        sql`select definicion.definicion_campo_id::text as id, definicion.plantilla_id::text as template_id,
            definicion.quien_llena_definicion_campo as responsible, definicion.contenido_definicion_campo::text as content,
            coalesce(bloque.clave_campo_plantilla, '') as key, definicion.vigente_en_plantilla as live
          from definiciones_campo definicion left join campos_plantilla bloque on bloque.campo_plantilla_id = definicion.campo_plantilla_id
          where definicion.definicion_campo_id = ${id}::uuid limit 1`,
      )
      if (!row) return null
      const record: DraftFieldRecord = { id: row.id, templateId: row.template_id, responsible: row.responsible, content: phpJsonDecode(row.content), key: row.key, live: row.live }
      return record
    },
    transaction,
    async storedValue(syllabusId, fieldId) {
      const [row] = await rowsOf<{ value: string | null }>(
        executor,
        sql`select valor_campo::text as value from valores_campo where silabo_id = ${syllabusId}::uuid and definicion_campo_id = ${fieldId}::uuid limit 1`,
      )
      return row ? phpJsonDecode(row.value) : null
    },
    identification: (syllabusId) => identificationSource(executor, syllabusId),
  }
}

export function createDraftFieldStore(): DraftFieldStore {
  return draftFieldStoreOn(db as unknown as Executor, (work) => db.transaction((tx) => work(draftTx(tx as unknown as Executor))))
}

export { draftTx }
