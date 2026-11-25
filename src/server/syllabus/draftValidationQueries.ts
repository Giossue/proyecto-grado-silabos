import "server-only"
import { eq, inArray } from "drizzle-orm"
import { db } from "@/db"
import { jsonText } from "@/db/expressions"
import { camposPlantilla, definicionesCampo, docentesVigentesSilabo, seccionesPlantilla, usuarios, valoresCampo } from "@/db/schema"
import { phpJsonDecode, phpTrim } from "../configuration/phpValues"
import type { DraftValidationStore, DraftValidationTx, ValidationField } from "./draftValidation"
import { draftTx, identificationSource, syllabusFacts } from "./draftFieldStore"
import { syllabusHasArchivedValues } from "./syllabusDetailQueries"
import type { Executor } from "./teacherSyllabusQueries"

async function documentFields(executor: Executor, syllabusId: string): Promise<ValidationField[]> {
  const archived = await syllabusHasArchivedValues(executor, syllabusId)
  const definitions = await executor
    .select({
      id: definicionesCampo.definicionCampoId,
      blockId: definicionesCampo.campoPlantillaId,
      responsible: definicionesCampo.quienLlenaDefinicionCampo,
      content: jsonText(definicionesCampo.contenidoDefinicionCampo),
    })
    .from(definicionesCampo)
    .where(
      archived
        ? inArray(definicionesCampo.definicionCampoId, executor.select({ id: valoresCampo.definicionCampoId }).from(valoresCampo).where(eq(valoresCampo.silaboId, syllabusId)))
        : eq(definicionesCampo.vigenteEnPlantilla, true),
    )
  const blockIds = [...new Set(definitions.map((row) => row.blockId))]
  const blocks =
    blockIds.length === 0
      ? []
      : await executor
          .select({ id: camposPlantilla.campoPlantillaId, key: camposPlantilla.claveCampoPlantilla, label: camposPlantilla.tituloCampoPlantilla, section: seccionesPlantilla.tituloSeccionPlantilla })
          .from(camposPlantilla)
          .leftJoin(seccionesPlantilla, eq(seccionesPlantilla.seccionPlantillaId, camposPlantilla.seccionPlantillaId))
          .where(inArray(camposPlantilla.campoPlantillaId, blockIds))
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
    async teachers(id) {
      return executor
        .select({ id: usuarios.usuarioId, name: usuarios.nombreUsuario, formation: usuarios.formacionExperienciaUsuario })
        .from(usuarios)
        .innerJoin(docentesVigentesSilabo, eq(usuarios.usuarioId, docentesVigentesSilabo.usuarioId))
        .where(eq(docentesVigentesSilabo.silaboId, id))
    },
  }
}

export function draftValidationStoreOn(executor: Executor, transaction: <T>(work: (tx: DraftValidationTx) => Promise<T>) => Promise<T>): DraftValidationStore {
  return { syllabus: (id, userId) => syllabusFacts(executor, id, userId), transaction }
}

export function createDraftValidationStore(): DraftValidationStore {
  return draftValidationStoreOn(db as unknown as Executor, (work) => db.transaction((tx) => work(validationTx(tx as unknown as Executor))))
}

export { validationTx }
