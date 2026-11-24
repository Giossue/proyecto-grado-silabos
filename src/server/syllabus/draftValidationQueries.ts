import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { uuidList } from "../laravel/sql"
import { phpJsonDecode, phpTrim } from "../configuration/phpValues"
import type { DraftValidationStore, DraftValidationTx, ValidationField } from "./draftValidation"
import { draftTx, identificationSource, syllabusFacts } from "./draftFieldStore"
import { syllabusDetailStoreOn } from "./syllabusDetailQueries"
import { rowsOf, type Executor } from "./teacherSyllabusQueries"

async function liveFields(executor: Executor): Promise<ValidationField[]> {
  const definitions = await rowsOf<{ id: string; block_id: string | null; responsible: string; content: string | null }>(
    executor,
    sql`select definicion_campo_id::text as id, campo_plantilla_id::text as block_id, quien_llena_definicion_campo as responsible,
        contenido_definicion_campo::text as content from definiciones_campo where vigente_en_plantilla = true`,
  )
  const blockIds = [...new Set(definitions.flatMap((row) => (row.block_id === null ? [] : [row.block_id])))]
  const blocks =
    blockIds.length === 0
      ? []
      : await rowsOf<{ id: string; key: string; label: string | null; section: string | null }>(
          executor,
          sql`select campos_plantilla.campo_plantilla_id::text as id, campos_plantilla.clave_campo_plantilla as key, campos_plantilla.titulo_campo_plantilla as label,
              secciones_plantilla.titulo_seccion_plantilla as section
            from campos_plantilla left join secciones_plantilla on secciones_plantilla.seccion_plantilla_id = campos_plantilla.seccion_plantilla_id
            where campos_plantilla.campo_plantilla_id in (${uuidList(blockIds)})`,
        )
  const byId = new Map(blocks.map((block) => [block.id, block]))
  return definitions.map((row) => {
    const block = row.block_id === null ? undefined : byId.get(row.block_id)
    const label = phpTrim(block?.label ?? "")
    return { id: row.id, key: block?.key ?? "", responsible: row.responsible, content: phpJsonDecode(row.content), displayName: label !== "" ? label : phpTrim(block?.section ?? "") }
  })
}

function validationTx(executor: Executor): DraftValidationTx {
  const draft = draftTx(executor)
  const details = syllabusDetailStoreOn(executor)
  return {
    lockSyllabus: (id) => draft.lockSyllabus(id),
    templateStore: draft.templateStore,
    hasArchivedValues: (id) => details.hasArchivedValues(id),
    liveFields: () => liveFields(executor),
    values: (id) => draft.values(id),
    identification: (id) => identificationSource(executor, id),
    async teachers(id) {
      return rowsOf<{ id: string; name: string; formation: string | null }>(
        executor,
        sql`select usuarios.usuario_id::text as id, usuarios.nombre_usuario as name, usuarios.formacion_experiencia_usuario as formation
          from usuarios inner join docentes_vigentes_silabo on usuarios.usuario_id = docentes_vigentes_silabo.usuario_id
          where docentes_vigentes_silabo.silabo_id = ${id}::uuid`,
      )
    },
    recordAudit: (event) => draft.recordAudit(event),
  }
}

export function draftValidationStoreOn(executor: Executor, transaction: <T>(work: (tx: DraftValidationTx) => Promise<T>) => Promise<T>): DraftValidationStore {
  return { syllabus: (id, userId) => syllabusFacts(executor, id, userId), transaction }
}

export function createDraftValidationStore(): DraftValidationStore {
  return draftValidationStoreOn(db as unknown as Executor, (work) => db.transaction((tx) => work(validationTx(tx as unknown as Executor))))
}

export { validationTx }
