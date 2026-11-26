import { Prisma } from "../../generated/prisma/client"
import { inTransaction } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import { jsonText, uuidList } from "../../prisma/sql"
import { phpJsonDecode, phpTrim } from "../configuration/phpValues"
import type { DraftValidationStore, DraftValidationTx, ValidationField } from "./draftValidation"
import { draftTx, identificationSource, syllabusFacts } from "./draftFieldStore"
import { syllabusHasArchivedValues } from "./syllabusDetailQueries"
import { rowsOf, type Executor } from "./teacherSyllabusQueries"

async function documentFields(executor: Executor, syllabusId: string): Promise<ValidationField[]> {
  const archived = await syllabusHasArchivedValues(executor, syllabusId)
  const definitions = await rowsOf<{ id: string; blockId: string; responsible: string; content: string | null }>(
    executor,
    Prisma.sql`select definiciones_campo.definicion_campo_id as id, definiciones_campo.campo_plantilla_id as "blockId",
        definiciones_campo.quien_llena_definicion_campo as responsible, ${jsonText(Prisma.raw("definiciones_campo.contenido_definicion_campo"))} as content
      from definiciones_campo
      where ${
        archived
          ? Prisma.sql`definiciones_campo.definicion_campo_id in (select valores_campo.definicion_campo_id from valores_campo where valores_campo.silabo_id = ${syllabusId}::uuid)`
          : Prisma.sql`definiciones_campo.vigente_en_plantilla = true`
      }`,
  )
  const blockIds = [...new Set(definitions.map((row) => row.blockId))]
  const blocks =
    blockIds.length === 0
      ? []
      : await rowsOf<{ id: string; key: string; label: string; section: string | null }>(
          executor,
          Prisma.sql`select campos_plantilla.campo_plantilla_id as id, campos_plantilla.clave_campo_plantilla as key, campos_plantilla.titulo_campo_plantilla as label,
              secciones_plantilla.titulo_seccion_plantilla as section
            from campos_plantilla left join secciones_plantilla on secciones_plantilla.seccion_plantilla_id = campos_plantilla.seccion_plantilla_id
            where campos_plantilla.campo_plantilla_id in (${uuidList(blockIds)})`,
        )
  const byId = new Map(blocks.map((block) => [block.id, block]))
  return definitions.map((row) => {
    const block = byId.get(row.blockId)
    const label = phpTrim(block?.label ?? "")
    return { id: row.id, key: block?.key ?? "", responsible: row.responsible, content: phpJsonDecode(row.content), displayName: label !== "" ? label : phpTrim(block?.section ?? "") }
  })
}

function validationTx(executor: Executor): DraftValidationTx {
  const draft = draftTx(executor)
  return {
    lockSyllabus: (id) => draft.lockSyllabus(id),
    templateStore: draft.templateStore,
    documentFields: (id) => documentFields(executor, id),
    values: (id) => draft.values(id),
    identification: (id) => identificationSource(executor, id),
  }
}

export function draftValidationStoreOn(executor: Executor, transaction: <T>(work: (tx: DraftValidationTx) => Promise<T>) => Promise<T>): DraftValidationStore {
  return { syllabus: (id, userId) => syllabusFacts(executor, id, userId), transaction }
}

export function createDraftValidationStore(prisma: PrismaService): DraftValidationStore {
  return draftValidationStoreOn(prisma, (work) => inTransaction(prisma, (tx) => work(validationTx(tx))))
}

export { validationTx }
