import { z } from "zod"
import { attributeName, checkItems, is, itemsAt, nullableField, requiredField, sometimesField, type Check } from "./fields"

export const STUDY_MODALITY_LABELS: Record<string, string> = {
  presencial: "Presencial",
  hibrida: "Híbrida",
  en_linea: "En línea",
}
export const STUDY_MODALITIES = Object.keys(STUDY_MODALITY_LABELS)

export function studyModalityLabel(value: string | null): string | null {
  return value === null ? null : (STUDY_MODALITY_LABELS[value] ?? value)
}
export const CURRICULAR_UNITS: Record<string, string> = {
  basica: "Unidad básica",
  profesional: "Unidad profesional",
  integracion_curricular: "Unidad de integración curricular",
}
export const SHIFTS = ["matutina", "vespertina", "nocturna"]

export const CYCLE_LIMIT = 30
export const CODE_MAX = 80
export const NAME_MAX = 180
export const PARALLEL_CODE_MAX = 30
export const PARALLEL_CODES_MAX = 50
export const LIBRARIES_MAX = 20

type Exists = (value: unknown) => Promise<boolean>

const purge = () => nullableField("confirmación de borrado", [is.boolean()])

export const statusSchema = z.object({ active: requiredField("activo", [is.boolean()]) })

const LIBRARY = /^[A-Za-z0-9_-]{1,20}$/

export function facultySchema({ updating }: { updating: boolean }) {
  return z
    .object({
      nombre: requiredField("nombre", [is.string(), is.max(NAME_MAX)]),
      catalog_libraries: sometimesField("catalog libraries", [is.array(), is.max(LIBRARIES_MAX)]),
      ...(updating ? { confirm_purge: purge() } : {}),
    })
    .superRefine(async (input, context) => {
      await checkItems(context, itemsAt(input.catalog_libraries, ["catalog_libraries"]), attributeName, [is.string(), is.distinct(), is.matches(LIBRARY)])
    })
}

export function careerSchema({ facultyExists, codeAvailable, updating }: { facultyExists?: Exists; codeAvailable?: Exists; updating: boolean }) {
  return z.object({
    faculty_id: requiredField("facultad", [is.uuid(), ...(facultyExists ? [is.existing(facultyExists)] : [])]),
    modality: requiredField("modalidad", [is.string(), is.oneOf(STUDY_MODALITIES)]),
    code: requiredField("código", [is.string(), is.max(CODE_MAX), ...(codeAvailable ? [is.unique(codeAvailable, "Ya existe una carrera con ese código.")] : [])]),
    nombre: requiredField("nombre", [is.string(), is.max(NAME_MAX)]),
    ...(updating ? { confirm_purge: purge() } : { cycle_count: requiredField("cantidad de ciclos", [is.integer(), is.min(1), is.max(CYCLE_LIMIT)]) }),
  })
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

export function isCalendarDay(value: string): boolean {
  const match = DATE_ONLY.exec(value)
  if (!match) return false
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3])
}

export const TEACHING_WEEKS_MAX = 52

export function periodSchema({ startsOn, creating }: { startsOn: unknown; creating: boolean }) {
  const notBeforeStart: Check = {
    test: (value) => {
      if (typeof value !== "string" || typeof startsOn !== "string" || !isCalendarDay(startsOn) || !isCalendarDay(value)) return null
      return value >= startsOn ? null : "El campo fecha de fin debe ser una fecha posterior o igual a fecha de inicio."
    },
  }
  return z.object({
    starts_on: requiredField("fecha de inicio", [is.date()]),
    ends_on: requiredField("fecha de fin", [is.date(), ...(creating ? [] : [notBeforeStart])]),
    teaching_weeks: nullableField("teaching weeks", [is.integer(), is.min(1), is.max(TEACHING_WEEKS_MAX)]),
    ...(creating ? {} : { confirm_purge: purge() }),
  })
}

export const curriculumConfigurationSchema = z.object({ cycle_count: requiredField("cantidad de ciclos", [is.integer(), is.min(1), is.max(CYCLE_LIMIT)]) })

export const MALLA_STATE_LABELS: Record<string, string> = { vigente: "Vigente", cerrada: "Cerrada" }
export const MALLA_STATES = Object.keys(MALLA_STATE_LABELS)

/** A career's curriculum (malla), identified by a code unique in the career (same rules as career and subject codes). Creating asks for its cycles and the malla starts vigente; editing changes code or state (cycles have their own schema). */
export function mallaSchema({ codeAvailable, updating }: { codeAvailable?: Exists; updating: boolean }) {
  const code = [is.string(), is.max(CODE_MAX), ...(codeAvailable ? [is.unique(codeAvailable, "Ya existe una malla con ese código en esta carrera.")] : [])]
  const state = [is.string(), is.oneOf(MALLA_STATES)]
  return z.object({
    code: updating ? sometimesField("código", code, { required: true }) : requiredField("código", code),
    ...(updating ? {} : { cycle_count: requiredField("cantidad de ciclos", [is.integer(), is.min(1), is.max(CYCLE_LIMIT)]) }),
    ...(updating ? { state: sometimesField("estado", state, { required: true }) } : {}),
  })
}

/** The malla of the scoped career that receives new subjects (subject form and Excel import). */
export function mallaTargetSchema({ mallaExists }: { mallaExists?: Exists } = {}) {
  return z.object({ malla_id: requiredField("malla", [is.uuid(), ...(mallaExists ? [is.existing(mallaExists)] : [])]) })
}

export function requirementSchema({ subjectId, hasSubject }: { subjectId: unknown; hasSubject: boolean }) {
  return z.object({
    subject_id: requiredField("materia", [is.uuid()]),
    requirement_id: requiredField("materia requisito", [
      is.uuid(),
      is.satisfying((value) => !(hasSubject && value === subjectId), "Los campos materia requisito y materia deben ser diferentes."),
    ]),
  })
}

export const subjectLayoutSchema = z.object({
  subject_id: requiredField("materia", [is.uuid()]),
  cycle: requiredField("ciclo", [is.integer(), is.min(1), is.max(CYCLE_LIMIT)]),
  position: requiredField("posición", [is.integer(), is.min(0), is.max(999)]),
})

export const HOURS_MAX = 9999.99

const hours = (label: string) => requiredField(label, [is.numeric(), is.min(0), is.max(HOURS_MAX)])

export function subjectSchema(codeAvailable?: Exists) {
  return z.object({
    code: requiredField("código", [is.string(), is.max(CODE_MAX), ...(codeAvailable ? [is.unique(codeAvailable, "Ya existe una materia con ese código.")] : [])]),
    nombre: requiredField("nombre", [is.string(), is.max(NAME_MAX)]),
    cycle: requiredField("ciclo", [is.integer(), is.min(1), is.max(CYCLE_LIMIT)]),
    position: nullableField("posición", [is.integer(), is.min(0), is.max(999)]),
    organization_unit: requiredField("unidad de organización curricular", [is.string(), is.oneOf(Object.keys(CURRICULAR_UNITS))]),
    modality: nullableField("modalidad", [is.string(), is.oneOf(STUDY_MODALITIES)]),
    creditos: hours("creditos"),
    horas_totales: requiredField("horas totales", [is.integer(), is.min(0), is.max(32767)]),
    horas_ac: hours("horas ac"),
    horas_pae: hours("horas pae"),
    horas_aa: hours("horas aa"),
    generates_syllabus: sometimesField("generates syllabus", [is.boolean()]),
  })
}

export function teacherAssignmentSchema({ userExists, parallelExists }: { userExists?: Exists; parallelExists?: Exists } = {}) {
  return z.object({
    user_id: requiredField("usuario", [is.uuid(), ...(userExists ? [is.existing(userExists)] : [])]),
    parallel_id: requiredField("paralelo", [is.uuid(), ...(parallelExists ? [is.existing(parallelExists)] : [])]),
  })
}

export function parallelsSchema({ subjectExists, userExists }: { subjectExists?: Exists; userExists?: Exists } = {}) {
  return z
    .object({
      subject_id: requiredField("materia", [is.uuid(), ...(subjectExists ? [is.existing(subjectExists)] : [])]),
      codes: requiredField("códigos de paralelo", [is.array(), is.min(1), is.max(PARALLEL_CODES_MAX)]),
      shift: requiredField("jornada", [is.string(), is.oneOf(SHIFTS)]),
      user_id: requiredField("usuario", [is.uuid(), ...(userExists ? [is.existing(userExists, "Elija un docente activo.")] : [])], {
        requiredMessage: "Seleccione el docente del paralelo.",
      }),
    })
    .superRefine(async (input, context) => {
      await checkItems(context, itemsAt(input.codes, ["codes"]), "código de paralelo", [is.string(), is.max(PARALLEL_CODE_MAX), is.distinct()], { required: true })
    })
}

export const parallelSchema = z.object({
  code: requiredField("código de paralelo", [is.string(), is.max(PARALLEL_CODE_MAX)]),
  shift: requiredField("jornada", [is.string(), is.oneOf(SHIFTS)]),
  confirm_purge: purge(),
})

export const parallelTeacherSchema = z.object({
  user_id: requiredField("docente", [is.uuid()]),
  confirm_purge: purge(),
})

export const NEW_PARALLELS_INCOMPLETE = "Elija la jornada y el docente de los nuevos paralelos"

export function newParallelsSchema() {
  const { shape } = parallelsSchema()

  return z.object({ shift: shape.shift, user_id: shape.user_id })
}

export const SUPPORT_DOCUMENT_TITLE_MAX = 180

const isFile = (value: unknown): value is File => typeof File !== "undefined" && value instanceof File

export const supportDocumentFormSchema = z.object({
  file: z.custom<File | null>(isFile, "Elija el archivo."),
  title: z.string().trim().min(1, "Escriba el nombre del documento.").max(SUPPORT_DOCUMENT_TITLE_MAX, "El nombre no puede pasar de 180 caracteres."),
})
