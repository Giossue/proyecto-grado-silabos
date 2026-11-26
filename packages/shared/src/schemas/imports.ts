import { z } from "zod"
import { checkItems, field, is, itemsAt, requiredField, sizeOf, sometimesField } from "./fields"

export const HASH_LENGTH = 64
const HASH = /^[a-f0-9]{64}$/

export const spreadsheetOptionsSchema = z.object({ confirm: sometimesField("confirmación", [is.boolean()]) })

const hash = (label: string) =>
  requiredField(label, [is.string(), is.refined((value) => (sizeOf(value, "string") === HASH_LENGTH ? [] : [`El campo ${label} debe tener 64 caracteres.`])), is.matches(HASH)])

export const fichaApplySchema = z
  .object({
    fingerprint: hash("estructura de la plantilla"),
    file_hash: hash("archivo revisado"),
    confirm_purge: sometimesField("confirmación de borrado", [is.boolean()]),
    subjects: requiredField("materias", [is.array(), is.min(1), is.max(100)]),
    fields: sometimesField("campos", [is.array()]),
  })
  .superRefine(async (input, context) => {
    await checkItems(context, itemsAt(input.subjects, ["subjects"]), "materia", [is.uuid(), is.distinct()])
    const fields = itemsAt(input.fields, ["fields"])
    await checkItems(context, fields, "campos de la materia", [is.array()])
    await checkItems(context, fields.flatMap(([path, value]) => itemsAt(value, path)), "campo", [is.string(), is.max(100)])
  })

export const subjectProfileValuesSchema = z
  .object({ values: field("datos del proyecto de carrera", [is.array()], { present: true }) })
  .superRefine(async (input, context) => {
    await checkItems(context, itemsAt(input.values, ["values"]), "dato del proyecto de carrera", [is.array()], { nullable: true })
  })


export const SUBJECT_PROFILE_BULK_ACTIONS = ["plantilla", "docente"] as const
export type SubjectProfileBulkAction = (typeof SUBJECT_PROFILE_BULK_ACTIONS)[number]

export const subjectProfileBulkSchema = z
  .object({
    subjects: requiredField("materias", [is.array(), is.min(1), is.max(200)]),
    fields: sometimesField("campos", [is.array(), is.max(100)]),
    action: requiredField("acción", [is.string(), is.oneOf(SUBJECT_PROFILE_BULK_ACTIONS)]),
    confirm_purge: sometimesField("confirmación de borrado", [is.boolean()]),
  })
  .superRefine(async (input, context) => {
    await checkItems(context, itemsAt(input.subjects, ["subjects"]), "materia", [is.uuid(), is.distinct()])
    await checkItems(context, itemsAt(input.fields, ["fields"]), "campo", [is.uuid(), is.distinct()])
  })
