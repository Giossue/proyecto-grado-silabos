import { z } from "zod"
import { checkItems, field, is, itemsAt, nullableField, requiredField, sometimesField } from "./fields"

export const spreadsheetOptionsSchema = z.object({ confirm: sometimesField("confirmación", [is.boolean()]) })

export const BULK_UNDECIDED = "Escriba el contenido del campo o use «Configurar campo» antes de aplicar."
export const BULK_NO_OPTIONS = "Agregue al menos una opción a la elección antes de aplicar."

export const subjectProfileBulkSchema = z
  .object({
    field_id: requiredField("campo", [is.uuid()]),
    value: nullableField("contenido del campo", [is.array()]),
    subjects: requiredField("materias", [is.array(), is.min(1), is.max(500)]),
    confirm_purge: sometimesField("confirmación de borrado", [is.boolean()]),
  })
  .superRefine(async (input, context) => {
    await checkItems(context, itemsAt(input.subjects, ["subjects"]), "materia", [is.uuid(), is.distinct()])
  })

export const subjectProfileValuesSchema = z
  .object({ values: field("datos del proyecto de carrera", [is.array()], { present: true }) })
  .superRefine(async (input, context) => {
    await checkItems(context, itemsAt(input.values, ["values"]), "dato del proyecto de carrera", [is.array()], { nullable: true })
  })
