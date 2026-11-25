import { z } from "zod"
import { addFailures, checkItems, field, fieldFailures, is, itemsAt, nullableField, requiredField } from "./fields"
import { LIBRARY_SORTS, sortFields } from "./listSort"
import { anyValue } from "./rules"

export const OTHER_REASON = "otro"

export const LIBRARY_COMMENT_REASONS: Record<string, string> = {
  libro_no_disponible: "El libro no está disponible en biblioteca",
  codigo_incorrecto: "El código del libro es incorrecto",
  isbn_incorrecto: "El ISBN es incorrecto",
  edicion_desactualizada: "La edición está desactualizada",
  datos_incompletos: "Los datos de la obra están incompletos",
  [OTHER_REASON]: "Otro motivo",
}

export const OTHER_REASON_MIN = 5

type CommentTexts = { chooseReason: string; otherRequired: string; otherMin: string }

const SERVER_TEXTS: CommentTexts = {
  chooseReason: "Elija al menos un motivo.",
  otherRequired: "Escriba el otro motivo.",
  otherMin: "Escriba el otro motivo con al menos 5 caracteres.",
}

const FORM_OTHER = "Escriba el otro motivo (mínimo 5 caracteres)"
const FORM_TEXTS: CommentTexts = { chooseReason: "Elija al menos un motivo", otherRequired: FORM_OTHER, otherMin: FORM_OTHER }

const chosenReasons = (reasons: unknown): unknown[] =>
  typeof reasons === "object" && reasons !== null ? Object.values(reasons) : reasons === undefined || reasons === null ? [] : [reasons]

const trimmedOrNull = (value: unknown): unknown => (typeof value === "string" ? value.trim() || null : value)

function commentSchema(texts: CommentTexts, normalize: (value: unknown) => unknown) {
  return z
    .object({
      reasons: field<string[]>("motivos", [is.array(), is.min(1, texts.chooseReason)], { required: true, requiredMessage: texts.chooseReason }),
      other: anyValue<string | null>().optional(),
    })
    .superRefine(async (input, context) => {
      await checkItems(context, itemsAt(input.reasons, ["reasons"]), "motivo", [is.string(), is.distinct(), is.oneOf(Object.keys(LIBRARY_COMMENT_REASONS), "El motivo elegido no es válido.")])
      const required = chosenReasons(input.reasons).includes(OTHER_REASON)
      const failures = await fieldFailures(normalize(input.other), "otro motivo", [is.string(), is.min(OTHER_REASON_MIN, texts.otherMin), is.max(1000)], {
        required,
        requiredMessage: texts.otherRequired,
        nullable: true,
      })
      addFailures(context, ["other"], failures)
    })
}

export const libraryCommentSchema = commentSchema(SERVER_TEXTS, (value) => value)

export const libraryCommentFormSchema = commentSchema(FORM_TEXTS, trimmedOrNull)

export type LibraryCommentValues = z.input<typeof libraryCommentFormSchema>

export const REVIEW_STATES = ["pendiente", "atendido"]
export const REVIEW_OUTCOMES = ["firmado", "devuelto", "reemplazado"]

export function libraryReviewFiltersSchema(exists: (table: "facultades" | "periodos_academicos") => (value: unknown) => Promise<boolean>) {
  return z.object({
    state: nullableField("estado", [is.string(), is.oneOf([...REVIEW_STATES, ...REVIEW_OUTCOMES])]),
    q: nullableField("búsqueda", [is.string(), is.max(120)]),
    faculty: nullableField("facultad", [is.uuid(), is.existing(exists("facultades"))]),
    period: nullableField("período", [is.uuid(), is.existing(exists("periodos_academicos"))]),
    mine: nullableField("solo los míos", [is.boolean()]),
    ...sortFields(LIBRARY_SORTS),
  })
}

export function catalogSearchSchema(fields: readonly string[], termCharacters: number) {
  return z.object({
    field: requiredField("campo de búsqueda", [is.string(), is.oneOf(fields)]),
    q: requiredField("texto a buscar", [is.string(), is.min(2), is.max(termCharacters)]),
    page: nullableField("página", [is.integer(), is.min(1), is.max(100)]),
  })
}
