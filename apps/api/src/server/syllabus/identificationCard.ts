import { isPhpArray, list, record } from "../configuration/phpValues"
import { identificationNumber } from "../configuration/templatePresentation"

export type Identification = Record<string, string>
export type IdentificationTeacher = { name: string | null; email: string | null }
export type IdentificationSource = {
  context: unknown
  parallelCode: string | null
  parallelShift: string | null
  teachers: IdentificationTeacher[]
  formation: string | null
}

const SHIFT_LABELS: Record<string, string> = { matutina: "Matutina", vespertina: "Vespertina", nocturna: "Nocturna" }
const CYCLES = ["", "Primero", "Segundo", "Tercero", "Cuarto", "Quinto", "Sexto", "Séptimo", "Octavo", "Noveno", "Décimo"]
const PHP_NUMERIC = /^[ \t\n\r\v\f]*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?[ \t\n\r\v\f]*$/
const ACCENTS: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u", Á: "A", É: "E", Í: "I", Ó: "O", Ú: "U" }

function phpTrim(value: string): string {
  return value.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "")
}

export function dataGet(target: unknown, path: string): unknown {
  let value = target
  for (const segment of path.split(".")) {
    if (!isPhpArray(value)) return null
    const current = Array.isArray(value) ? Object.fromEntries(value.map((item, index) => [String(index), item])) : record(value)
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return null
    value = current[segment]
  }
  return value ?? null
}

function text(value: unknown): string {
  if (value === null || value === undefined || isPhpArray(value) || typeof value === "boolean") return ""
  return phpTrim(String(value))
}

function cycle(value: unknown): string {
  const numeric = typeof value === "number" || (typeof value === "string" && PHP_NUMERIC.test(value))
  const index = numeric ? Math.trunc(Number(value)) : 0
  return index >= 1 && index <= 10 ? CYCLES[index] : text(value)
}

function join(values: unknown): string {
  if (!isPhpArray(values)) return text(values)
  return list(values)
    .filter((item) => (typeof item === "string" || typeof item === "number" || typeof item === "boolean") && phpTrim(String(item === true ? "1" : item === false ? "" : item)) !== "")
    .map((item) => phpTrim(String(item === true ? "1" : item)))
    .join(", ")
}

function strings(values: (string | null)[]): string[] {
  const unique: string[] = []
  for (const value of values) if (typeof value === "string" && value !== "" && !unique.includes(value)) unique.push(value)
  return unique
}

function falsyAsNone(value: string): string {
  return value === "" || value === "0" ? "Ninguno" : value
}

function scheduled(context: unknown, key: string): string {
  return text(dataGet(context, `scheduled_subject.${key}`) ?? dataGet(context, `offering.${key}`))
}

export function buildIdentification(context: unknown, parallels: string[], teachers: string[], emails: string[], inputs: Record<string, string> = {}): Identification {
  const get = (path: string) => text(dataGet(context, path))
  const input = (key: string) => text(inputs[key] ?? null)
  return {
    faculty: get("career.faculty"),
    career: get("career.name"),
    modality: scheduled(context, "modality"),
    campus: scheduled(context, "campus"),
    subject: get("subject.name"),
    period: scheduled(context, "period"),
    cycle: cycle(dataGet(context, "subject.cycle")),
    parallel: join(parallels),
    shift: "",
    code: get("subject.code"),
    prerequisites: falsyAsNone(join(dataGet(context, "subject.prerequisites"))),
    corequisites: falsyAsNone(join(dataGet(context, "subject.corequisites"))),
    organization_unit: get("subject.organization_unit"),
    hours_ac: identificationNumber(get("subject.hours_ac")),
    hours_pae: identificationNumber(get("subject.hours_pae")),
    hours_aa: identificationNumber(get("subject.hours_aa")),
    total_hours: identificationNumber(get("subject.total_hours")),
    credits: identificationNumber(get("subject.credits")),
    teaching_weeks: identificationNumber(scheduled(context, "teaching_weeks")),
    teacher: join(teachers),
    email: join(emails),
    disability:
      "discapacidad_tiene" in inputs
        ? input("discapacidad_tiene").replace(/[áéíóúÁÉÍÓÚ]/g, (character) => ACCENTS[character]).toLowerCase()
        : input("discapacidad_tipo") !== ""
          ? "si"
          : "no",
    disability_type: input("discapacidad_tipo"),
    disability_description: input("discapacidad_adaptacion"),
    formation: input("formacion_experiencia"),
  }
}

function contextString(context: unknown, path: string, fallback: string | null): string | null {
  const value = dataGet(context, path)
  return typeof value === "string" ? value : fallback
}

function ucfirst(value: string): string {
  return value === "" ? value : value[0].toUpperCase() + value.slice(1)
}

export function identificationOf(source: IdentificationSource): Identification {
  const data = buildIdentification(
    source.context,
    strings([contextString(source.context, "parallel.code", source.parallelCode)]),
    strings(source.teachers.map((teacher) => teacher.name)),
    strings(source.teachers.map((teacher) => teacher.email)),
    { formacion_experiencia: source.formation ?? "" },
  )
  data.shift = strings([contextString(source.context, "parallel.shift", source.parallelShift)])
    .map((shift) => SHIFT_LABELS[shift] ?? ucfirst(shift))
    .join(", ")
  return data
}
