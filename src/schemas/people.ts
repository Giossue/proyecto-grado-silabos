import { z } from "zod"
import { emailField, type UniqueCheck } from "./account"
import { MANAGED_USER_SORTS, sortFields } from "./listSort"
import { messages } from "./messages"
import { addIssues, codePointLength, isBlank, nullableChoice, nullableInteger, nullableText, requiredBoolean, requiredText, requiredValue, UUID_PATTERN } from "./rules"

export const NAME_MAX_LENGTH = 90
export const ROLE_CODES = ["administrador", "coordinador", "docente", "bibliotecario"] as const
export const INSTITUTIONAL_ROLES: readonly string[] = ["administrador", "bibliotecario"]

const PHP_TRIM = /^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g
const PCRE_SPACES = /[\t\n\v\f\r \x85\xa0\u{1680}\u{2000}-\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}]+/gu
const NAME_PART = /^[\p{L}\p{M}]+(?:[ '’-][\p{L}\p{M}]+)*$/u

export function collapseName(value: string): string {
  return value.replace(PHP_TRIM, "").replace(PCRE_SPACES, " ")
}

export function isValidNamePart(value: string): boolean {
  return NAME_PART.test(collapseName(value))
}

export const NAME_SUBJECTS = { nombres: "Los nombres", apellidos: "Los apellidos" } as const

export function nameColumnMessages(subject: string) {
  return {
    required: `${subject} son obligatorios.`,
    max: `${subject} admiten hasta ${NAME_MAX_LENGTH} caracteres.`,
    regex: `${subject} solo admiten letras, espacios, apóstrofo y guion.`,
  }
}

export function nameColumnField(key: keyof typeof NAME_SUBJECTS) {
  const text = nameColumnMessages(NAME_SUBJECTS[key])
  return requiredText(text.required, messages.string(key)).superRefine((raw, context) => {
    const value = collapseName(raw)
    if (value === "") return addIssues(context, [text.required])
    const failed: string[] = []
    if (codePointLength(value) > NAME_MAX_LENGTH) failed.push(text.max)
    if (!NAME_PART.test(value)) failed.push(text.regex)
    addIssues(context, failed)
  })
}

export function prohibited(label: string) {
  return z
    .custom<unknown>()
    .optional()
    .refine((value) => isBlank(value), { message: messages.prohibited(label) })
}

export function roleCodeField(required = messages.required("rol")) {
  return requiredValue(required).refine((value) => typeof value === "string" && (ROLE_CODES as readonly string[]).includes(value), { message: messages.in("rol") })
}

export const requiresCareer = (roleCode: unknown): boolean => !(typeof roleCode === "string" && INSTITUTIONAL_ROLES.includes(roleCode))

export type ExistsCheck = (value: string) => Promise<boolean>

export function careerField(options: { required: boolean; requiredMessage: string; exists?: ExistsCheck }) {
  return z.custom<string | null | undefined>().superRefine(async (value, context) => {
      if (isBlank(value)) {
        if (options.required) addIssues(context, [options.requiredMessage])
        return
      }
      if (typeof value !== "string" || !UUID_PATTERN.test(value)) return addIssues(context, [messages.uuid("carrera")])
      if (options.exists && !(await options.exists(value))) addIssues(context, [messages.exists("carrera")])
    })
    .prefault(null)
}

export const optionalBoolean = (label: string) => requiredBoolean(messages.boolean(label), messages.boolean(label)).optional()

export const TEACHER_EMAIL = (unique?: UniqueCheck, uniqueMessage?: string) => emailField("correo electrónico", { max: 255, unique, uniqueMessage })

export function careerTeacherSchema() {
  return z.object({
    nombres: nameColumnField("nombres"),
    apellidos: nameColumnField("apellidos"),
    nombre: prohibited("nombre"),
    correo_electronico: TEACHER_EMAIL(),
    password: prohibited("contraseña"),
    role_code: prohibited("rol"),
    career_id: prohibited("carrera"),
    user_id: prohibited("usuario"),
    active: prohibited("activo"),
    activo: prohibited("activo"),
  })
}

export type CareerTeacherValues = z.input<ReturnType<typeof careerTeacherSchema>>

type ManagedUserContext = { roleCode: unknown; unique?: UniqueCheck; careerExists?: ExistsCheck }

export function newManagedUserSchema({ roleCode, unique, careerExists }: ManagedUserContext) {
  return z.object({
    nombres: nameColumnField("nombres"),
    apellidos: nameColumnField("apellidos"),
    nombre: prohibited("nombre"),
    correo_electronico: TEACHER_EMAIL(unique, "Ya existe una cuenta con este correo."),
    password: prohibited("contraseña"),
    role_code: roleCodeField(),
    career_id: careerField({ required: requiresCareer(roleCode), requiredMessage: "Seleccione la carrera que limita este rol.", exists: careerExists }),
    replace_coordinator: optionalBoolean("reemplazo de coordinación"),
    faculty_id: prohibited("facultad"),
  })
}

export type NewManagedUserValues = z.input<ReturnType<typeof newManagedUserSchema>>

export const FULL_NAME_MESSAGE = "Escriba los nombres y los apellidos, solo con letras."

export function isValidFullName(value: string): boolean {
  return isValidNamePart(value) && collapseName(value).split(" ").length >= 2
}

export function managedUserSchema({ roleCode, unique, careerExists, currentName }: ManagedUserContext & { currentName: string }) {
  const normalized = (value: string) => collapseName(value).toUpperCase()
  return z.object({
    nombre: requiredText(messages.required("nombre"), messages.string("nombre")).superRefine((value, context) => {
      const failed: string[] = []
      if (codePointLength(value) > 180) failed.push(messages.max("nombre", 180))
      if (!isValidFullName(value) && normalized(value) !== normalized(currentName)) failed.push(FULL_NAME_MESSAGE)
      addIssues(context, failed)
    }),
    correo_electronico: TEACHER_EMAIL(unique, "Ya existe otra cuenta con este correo."),
    active: requiredBoolean(messages.required("activo"), messages.boolean("activo")).optional(),
    role_code: roleCodeField().optional(),
    career_id: isBlank(roleCode)
      ? z.custom<string | null>().optional()
      : careerField({ required: requiresCareer(roleCode), requiredMessage: CAREER_REQUIRED_UNLESS, exists: careerExists }),
    replace_coordinator: optionalBoolean("reemplazo de coordinación"),
    faculty_id: prohibited("facultad"),
  })
}

export type ManagedUserValues = z.input<ReturnType<typeof managedUserSchema>>

export function importedUserSchema({ roleCode, unique, careerExists }: ManagedUserContext) {
  return z.object({
    nombre: requiredText(messages.required("nombre"), messages.string("nombre")).refine((value) => codePointLength(value) <= 180, { message: messages.max("nombre", 180) }),
    correo_electronico: TEACHER_EMAIL(unique, "Ya existe una cuenta con este correo."),
    role_code: roleCodeField(),
    career_id: careerField({ required: requiresCareer(roleCode), requiredMessage: "Seleccione la carrera que limita este rol.", exists: careerExists }),
  })
}

export const importedTeacherSchema = importedUserSchema({ roleCode: "administrador" }).pick({ nombre: true, correo_electronico: true })

export const MANAGED_USER_STATUSES = ["active", "pending", "inactive"] as const

export const managedUserFiltersSchema = z.object({
  q: nullableText("búsqueda", { max: 120 }),
  status: nullableChoice("estado", ["all", ...MANAGED_USER_STATUSES]),
  role: nullableChoice("rol", ["all", ...ROLE_CODES]),
  career: nullableText("carrera", { max: 36 }),
  page: nullableInteger("página", { min: 1 }),
  ...sortFields(MANAGED_USER_SORTS),
})

export function managedUserFormSchema({ teacher, roleCode }: { teacher: boolean; roleCode: unknown }) {
  return z.object({
    nombres: nameColumnField("nombres"),
    apellidos: nameColumnField("apellidos"),
    correo_electronico: TEACHER_EMAIL(),
    role_code: teacher ? z.string() : roleCodeField(),
    career_id: teacher ? z.string() : careerField({ required: requiresCareer(roleCode), requiredMessage: "Seleccione la carrera que limita este rol." }),
  })
}

export type ManagedUserFormValues = z.input<ReturnType<typeof managedUserFormSchema>>

export const CAREER_REQUIRED_UNLESS = "El campo carrera es obligatorio a menos que rol esté en administrador, bibliotecario."

export function managedUserEditFormSchema({ checkNames, roleCode }: { checkNames: boolean; roleCode: unknown }) {
  return z.object({
    nombres: checkNames ? nameColumnField("nombres") : z.string(),
    apellidos: checkNames ? nameColumnField("apellidos") : z.string(),
    correo_electronico: TEACHER_EMAIL(),
    role_code: z.string(),
    career_id: isBlank(roleCode) ? z.string() : careerField({ required: requiresCareer(roleCode), requiredMessage: CAREER_REQUIRED_UNLESS }),
  })
}

export type ManagedUserEditFormValues = z.input<ReturnType<typeof managedUserEditFormSchema>>
