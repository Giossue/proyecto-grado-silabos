import { Prisma } from "../../generated/prisma/client"
import { inTransaction } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import { fromEpoch, hasRows, institutionDateSql, jsonbValue, jsonText } from "../../prisma/sql"
import { phpShape } from "../configuration/phpValues"
import { phpJsonDecode } from "../configuration/phpValues"
import { createTemplateStore } from "../shared/templateStore"
import type { DraftFieldRecord, DraftFieldStore, DraftFieldTx, DraftSyllabus } from "./draftField"
import type { IdentificationSource } from "./identificationCard"
import { currentTeacherSql, SYLLABUS_EXISTS, writtenBySql } from "./syllabusSql"
import { CAMPUS_FIELD, COREQUISITES_FIELD, FORMATION_FIELD, teacherFieldText } from "./teacherFields"
import { rowsOf, type Executor } from "./teacherSyllabusQueries"

export async function syllabusFacts(executor: Executor, id: string, userId: string): Promise<DraftSyllabus | null> {
  const [row] = await rowsOf<DraftSyllabus>(
    executor,
    Prisma.sql`select silabos.silabo_id as id, silabos.estado_silabo as state, convocatorias_carreras.carrera_id as "careerId",
        convocatorias_carreras.estado_convocatoria_carrera as "convocationState", convocatorias_universidad.estado_convocatoria_universidad as "processState",
        ${institutionDateSql(Prisma.raw("convocatorias_universidad.fecha_entrega"))} as "dueOn",
        ${currentTeacherSql(userId)} as "currentTeacher", ${writtenBySql(userId)} as "writtenByUser",
        exists (select envios_biblioteca.envio_biblioteca_id from envios_biblioteca
          inner join revisiones_silabo on revisiones_silabo.revision_silabo_id = envios_biblioteca.revision_silabo_id
          where revisiones_silabo.silabo_id = silabos.silabo_id) as "hasLibrarySubmission",
        paralelos.asignatura_id as "subjectId", silabos.iniciado_en is not null as started
      from silabos
        inner join convocatorias_carreras on convocatorias_carreras.convocatoria_carrera_id = silabos.convocatoria_carrera_id
        inner join convocatorias_universidad on convocatorias_universidad.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id
        inner join paralelos on paralelos.paralelo_id = silabos.paralelo_id
      where silabos.silabo_id = ${id}::uuid limit 1`,
  )
  return row ?? null
}

export async function identificationSource(executor: Executor, syllabusId: string): Promise<IdentificationSource> {
  const [syllabus] = await rowsOf<{ context: string | null; code: string | null; shift: string | null }>(
    executor,
    Prisma.sql`select ${jsonText(Prisma.raw("silabos.datos_academicos_silabo"))} as context, paralelos.codigo_paralelo as code, paralelos.jornada_paralelo as shift
      from silabos left join paralelos on paralelos.paralelo_id = silabos.paralelo_id
      where silabos.silabo_id = ${syllabusId}::uuid limit 1`,
  )
  const teachers = await rowsOf<{ name: string; email: string }>(
    executor,
    Prisma.sql`select usuarios.nombre_usuario as name, usuarios.correo_electronico as email
      from usuarios inner join docentes_vigentes_silabo on usuarios.usuario_id = docentes_vigentes_silabo.usuario_id
      where docentes_vigentes_silabo.silabo_id = ${syllabusId}::uuid`,
  )
  return {
    context: phpJsonDecode(syllabus?.context ?? "[]"),
    parallelCode: syllabus?.code ?? null,
    parallelShift: syllabus?.shift ?? null,
    teachers,
    formation: await teacherFieldText(executor, syllabusId, FORMATION_FIELD),
    campus: await teacherFieldText(executor, syllabusId, CAMPUS_FIELD),
    corequisites: await teacherFieldText(executor, syllabusId, COREQUISITES_FIELD),
  }
}

function syllabusValue(syllabusId: string, fieldId: string): Prisma.Sql {
  return Prisma.sql`valores_campo.silabo_id = ${syllabusId}::uuid and valores_campo.definicion_campo_id = ${fieldId}::uuid`
}

function draftTx(executor: Executor): DraftFieldTx {
  return {
    async lockSyllabus(id) {
      const [row] = await rowsOf<{ id: string; state: string; version: number; subjectId: string; started: boolean }>(
        executor,
        Prisma.sql`select silabos.silabo_id as id, silabos.estado_silabo as state, silabos.version_borrador as version, silabos.iniciado_en is not null as started,
            (select paralelos.asignatura_id from paralelos where paralelos.paralelo_id = silabos.paralelo_id) as "subjectId"
          from silabos where silabos.silabo_id = ${id}::uuid and ${SYLLABUS_EXISTS} limit 1 for update`,
      )
      return row ? { id: row.id, state: row.state, version: Number(row.version), subjectId: row.subjectId, started: row.started === true } : null
    },
    templateStore: createTemplateStore(executor),
    async values(syllabusId) {
      const rows = await rowsOf<{ fieldId: string; value: string | null }>(
        executor,
        Prisma.sql`select valores_campo.definicion_campo_id as "fieldId", ${jsonText(Prisma.raw("valores_campo.valor_campo"))} as value
          from valores_campo where valores_campo.silabo_id = ${syllabusId}::uuid`,
      )
      return new Map(rows.map((row) => [row.fieldId, phpJsonDecode(row.value)]))
    },
    valueExists: (syllabusId, fieldId) =>
      hasRows(rowsOf(executor, Prisma.sql`select valores_campo.valor_campo_id as id from valores_campo where ${syllabusValue(syllabusId, fieldId)} limit 1`)),
    async saveValue(syllabusId, fieldId, document, newId, fingerprint) {
      const value = jsonbValue(JSON.stringify(phpShape(document)))
      const [existing] = await rowsOf<{ id: string }>(
        executor,
        Prisma.sql`select valores_campo.valor_campo_id as id from valores_campo where ${syllabusValue(syllabusId, fieldId)} limit 1`,
      )
      if (existing) {
        await executor.$executeRaw`update valores_campo set valor_campo = ${value}, huella_definicion_campo = ${fingerprint} where valores_campo.valor_campo_id = ${existing.id}::uuid`
        return
      }
      await executor.$executeRaw`insert into valores_campo (valor_campo_id, silabo_id, definicion_campo_id, valor_campo, huella_definicion_campo)
        values (${newId}::uuid, ${syllabusId}::uuid, ${fieldId}::uuid, ${value}, ${fingerprint})`
    },
    async saveDraft(syllabusId, version, savedAt, state) {
      await executor.$executeRaw`update silabos set estado_silabo = ${state}, version_borrador = ${version}, guardado_en = ${fromEpoch(savedAt)} where silabos.silabo_id = ${syllabusId}::uuid`
    },
  }
}

export function draftFieldStoreOn(executor: Executor, transaction: <T>(work: (tx: DraftFieldTx) => Promise<T>) => Promise<T>): DraftFieldStore {
  return {
    syllabus: (id, userId) => syllabusFacts(executor, id, userId),
    async field(id) {
      const [row] = await rowsOf<Omit<DraftFieldRecord, "content"> & { content: string | null }>(
        executor,
        Prisma.sql`select definiciones_campo.definicion_campo_id as id, definiciones_campo.plantilla_id as "templateId",
            definiciones_campo.quien_llena_definicion_campo as responsible, ${jsonText(Prisma.raw("definiciones_campo.contenido_definicion_campo"))} as content,
            coalesce(campos_plantilla.clave_campo_plantilla, '') as key, definiciones_campo.vigente_en_plantilla as live
          from definiciones_campo left join campos_plantilla on campos_plantilla.campo_plantilla_id = definiciones_campo.campo_plantilla_id
          where definiciones_campo.definicion_campo_id = ${id}::uuid limit 1`,
      )
      if (!row) return null
      const record: DraftFieldRecord = { ...row, content: phpJsonDecode(row.content) }
      return record
    },
    transaction,
    async storedValue(syllabusId, fieldId) {
      const [row] = await rowsOf<{ value: string | null }>(
        executor,
        Prisma.sql`select ${jsonText(Prisma.raw("valores_campo.valor_campo"))} as value from valores_campo where ${syllabusValue(syllabusId, fieldId)} limit 1`,
      )
      return row ? phpJsonDecode(row.value) : null
    },
    identification: (syllabusId) => identificationSource(executor, syllabusId),
  }
}

export function createDraftFieldStore(prisma: PrismaService): DraftFieldStore {
  return draftFieldStoreOn(prisma, (work) => inTransaction(prisma, (tx) => work(draftTx(tx))))
}

export { draftTx }
