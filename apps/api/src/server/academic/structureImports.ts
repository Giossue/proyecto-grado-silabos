import { requireSession } from "../auth/requireSession"
import type { AppSession } from "../auth/types"
import { importTemplate, type TemplateSelect } from "../excel/importTemplate"
import { importKey, phpIntValue, phpIsNumeric, phpLength, PhpMap, ctypeDigit } from "../excel/importKeys"
import { importRows, importSession, spreadsheetUpload, type CheckedRow, type ImportDeps, type ImportResult } from "../excel/importRequest"
import type { ImportRow } from "../excel/spreadsheetReader"
import { xlsxDownload } from "../excel/workbook"
import type { PhpArray } from "../http/input"
import { apiJson } from "../http/responses"
import { settle } from "../syllabus/reviewDecisions"
import type { CareerContext, CareerWriteTx } from "./careerWrites"
import { insertCareerSubject } from "./careerWrites"
import type { CurriculumTx } from "./curriculumWrites"
import { addRequirement, curriculumMutation } from "./curriculumWrites"
import type { GovernanceWriteTx } from "./governanceWrites"
import { CURRICULAR_UNITS, STUDY_MODALITIES } from "./structure"

export const CAREER_COLUMNS = { facultad: "Facultad", modalidad: "Modalidad", codigo: "Código de carrera", nombre: "Nombre de la carrera", ciclos: "Número de ciclos" }

export const CURRICULUM_COLUMNS = {
  codigo: "Código",
  nombre: "Nombre de la materia",
  ciclo: "Ciclo",
  unidad: "Unidad de organización",
  modalidad: "Modalidad",
  genera_silabo: "Genera sílabo",
  acd: "Horas ACD",
  ape: "Horas APE",
  aa: "Horas AA",
  creditos: "Créditos",
  prerrequisitos: "Prerrequisitos (códigos)",
  correquisitos: "Correquisitos (códigos)",
}

const CURRICULUM_OPTIONAL = ["genera_silabo"]
const YES = "Sí"
const NO = "No"

const CAREER_NOTES = [
  "Una fila por carrera; no deje filas vacías entre registros.",
  "Facultad y Modalidad: elija una opción de la lista.",
  "Código de carrera: único en el sistema, por ejemplo SW.",
  "Número de ciclos: un entero entre 1 y 30.",
  "Las facultades no se importan: se crean una por una.",
]

const CURRICULUM_NOTES = [
  "Una fila por materia; no deje filas vacías entre registros.",
  "Código: único en la malla, por ejemplo SW-B1-001.",
  "Ciclo: un número entre 1 y el número de ciclos de la carrera.",
  "Unidad de organización y Modalidad: elija una opción de la lista (la modalidad es opcional).",
  "Genera sílabo: Sí o No. Si la materia no lleva sílabo, elija No; si la deja vacía se toma Sí.",
  "Horas y créditos: números; las horas totales se calculan solas.",
  "Prerrequisitos (de un ciclo anterior) y correquisitos (del mismo ciclo): códigos separados por coma; pueden ser materias de la malla o del mismo archivo.",
]

export const CAREERS_FORBIDDEN = "No puede importar carreras con el rol activo."
export const CURRICULUM_FORBIDDEN = "Solo la coordinación de la carrera puede importar la malla."

export type StructureImportStore = {
  activeFaculties(): Promise<{ id: string; name: string }[]>
  facultiesForImport(): Promise<{ id: string; name: string }[]>
  careerCodes(): Promise<string[]>
  careerActive(careerId: string): Promise<boolean>
  career(careerId: string): Promise<{ id: string; cycleCount: number } | null>
  careerSubjects(careerId: string): Promise<{ id: string; code: string; cycle: number | null }[]>
}

export type CurriculumImportTx = { subjects: CareerWriteTx; requirements: CurriculumTx }

export type StructureImportTransactions = {
  now: () => number
  governance<T>(work: (tx: GovernanceWriteTx) => Promise<T>): Promise<T>
  curriculum<T>(work: (tx: CurriculumImportTx) => Promise<T>): Promise<T>
}

export type StructureImportDeps = ImportDeps & StructureImportTransactions & { store: StructureImportStore }

const forbiddenWith = (message: string) => apiJson({ message }, 403)

function mayImportCareers(session: AppSession): boolean {
  return session.activeRole?.role === "administrador"
}

async function curriculumCareer(session: AppSession, deps: StructureImportDeps): Promise<{ id: string; cycleCount: number } | null> {
  const role = session.activeRole
  if (role?.role !== "coordinador" || role.careerId === null || !(await deps.store.careerActive(role.careerId))) return null
  return deps.store.career(role.careerId)
}

export function unitFromText(text: string): string | null {
  const lower = text.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "").toLowerCase()
  if (lower === "") return null
  if (lower in CURRICULAR_UNITS) return lower
  const plain = lower.replace(/[áéíóú]/g, (character) => ({ á: "a", é: "e", í: "i", ó: "o", ú: "u" })[character] ?? character)
  if (plain.includes("basic")) return "basica"
  if (plain.includes("profesional")) return "profesional"
  if (plain.includes("integracion") || plain.includes("titulacion")) return "integracion_curricular"
  return null
}

function codes(value: string): string[] {
  return value
    .split(/[,;\n]+/)
    .map((code) => code.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, ""))
    .filter((code) => code !== "")
}

function phpAddZero(value: string): number {
  return Number(value.trim())
}

async function templateResponse(headers: string[], selects: TemplateSelect[], notes: string[], filename: string, deps: StructureImportDeps): Promise<Response> {
  return xlsxDownload(await importTemplate(headers, selects, notes, { now: deps.now() }), filename)
}

export async function careerImportTemplate(request: Request, deps: StructureImportDeps): Promise<Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  if (!mayImportCareers(session)) return forbiddenWith(CAREERS_FORBIDDEN)
  const faculties = (await deps.store.activeFaculties()).map((faculty) => faculty.name)
  return templateResponse(Object.values(CAREER_COLUMNS), [{ column: 0, options: faculties }, { column: 1, options: STUDY_MODALITIES }], CAREER_NOTES, "plantilla-carreras.xlsx", deps)
}

export async function curriculumImportTemplate(request: Request, deps: StructureImportDeps): Promise<Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  if ((await curriculumCareer(session, deps)) === null) return forbiddenWith(CURRICULUM_FORBIDDEN)
  const keys = Object.keys(CURRICULUM_COLUMNS)
  return templateResponse(
    Object.values(CURRICULUM_COLUMNS),
    [
      { column: keys.indexOf("unidad"), options: Object.values(CURRICULAR_UNITS) },
      { column: keys.indexOf("modalidad"), options: STUDY_MODALITIES },
      { column: keys.indexOf("genera_silabo"), options: [YES, NO] },
    ],
    CURRICULUM_NOTES,
    "plantilla-malla.xlsx",
    deps,
  )
}

type CareerPayload = { faculty_id: string | null; modality: string | null; code: string; nombre: string; cycle_count: number }

async function checkCareers(rows: ImportRow[], deps: StructureImportDeps): Promise<{ checked: CheckedRow[]; payloads: CareerPayload[] }> {
  const faculties = new PhpMap<string>()
  for (const faculty of await deps.store.facultiesForImport()) faculties.set(importKey(faculty.name), faculty.id)
  const modalities = new PhpMap<string>()
  for (const modality of STUDY_MODALITIES) modalities.set(importKey(modality), modality)
  const taken = new PhpMap<true>()
  for (const code of await deps.store.careerCodes()) taken.set(importKey(code), true)
  const seen = new PhpMap<number>()
  const checked: CheckedRow[] = []
  const payloads: CareerPayload[] = []
  for (const row of rows) {
    const values = row.values
    const errors: string[] = []
    const facultyId = faculties.get(importKey(values.facultad)) ?? null
    const modality = modalities.get(importKey(values.modalidad)) ?? null
    const code = values.codigo.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "")
    const name = values.nombre.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "")
    const cycles = values.ciclos
    const codeKey = importKey(code)
    if (facultyId === null) errors.push("La facultad no existe o está inactiva.")
    if (modality === null) errors.push("La modalidad no es válida.")
    if (code === "" || phpLength(code) > 80) errors.push("El código es obligatorio y admite hasta 80 caracteres.")
    else if (taken.has(codeKey)) errors.push("Ya existe una carrera con este código.")
    else if (seen.has(codeKey)) errors.push(`El código se repite en la fila ${seen.get(codeKey)}.`)
    if (!seen.has(codeKey)) seen.set(codeKey, row.line)
    if (name === "" || phpLength(name) > 180) errors.push("El nombre es obligatorio y admite hasta 180 caracteres.")
    if (!ctypeDigit(cycles) || phpIntValue(cycles) < 1 || phpIntValue(cycles) > 30) errors.push("El número de ciclos debe estar entre 1 y 30.")
    checked.push({ ...row, errors })
    payloads.push({ faculty_id: facultyId, modality, code, nombre: name, cycle_count: phpIntValue(cycles) })
  }
  return { checked, payloads }
}

export async function importCareers(request: Request, deps: StructureImportDeps): Promise<Response> {
  const ready = await importSession(request, deps, 10)
  if (ready instanceof Response) return ready
  const { session, original, finish } = ready
  const upload = await spreadsheetUpload(request)
  if (upload instanceof Response) return finish(upload)
  if (!mayImportCareers(session)) return finish(forbiddenWith(CAREERS_FORBIDDEN))
  const rows = importRows(upload.file, CAREER_COLUMNS)
  if (rows instanceof Response) return finish(rows)
  const { checked, payloads } = await checkCareers(rows, deps)
  const valid = checked.every((row) => row.errors.length === 0)
  if (!upload.confirm || !valid) return finish(apiJson({ rows: checked, valid, created: 0 } satisfies ImportResult))
  return finish(
    await settle(original, deps, async () => {
      const created = await deps.governance(async (tx) => {
        let count = 0
        for (const payload of payloads) {
          await tx.replace(
            false,
            async () => {
              await tx.createCareer({ facultyId: payload.faculty_id as string, modality: payload.modality as string, code: payload.code, name: payload.nombre, cycleCount: payload.cycle_count })
            },
            null,
          )
          count++
        }
        return count
      })
      return apiJson({ rows: checked, valid, created } satisfies ImportResult)
    }),
  )
}

type CurriculumPayload = { key: string; relations: { code: string; type: string }[]; data: PhpArray }

async function checkCurriculum(
  rows: ImportRow[],
  career: { id: string; cycleCount: number },
  deps: StructureImportDeps,
): Promise<{ checked: CheckedRow[]; payloads: CurriculumPayload[]; existing: PhpMap<string> }> {
  const stored = await deps.store.careerSubjects(career.id)
  const existing = new PhpMap<string>()
  const storedCycles = new PhpMap<number>()
  for (const subject of stored) {
    existing.set(importKey(subject.code), subject.id)
    storedCycles.set(importKey(subject.code), subject.cycle ?? 0)
  }
  const fileCycles = new PhpMap<number>()
  const fileCodes = new PhpMap<number>()
  for (const row of rows) {
    fileCycles.set(importKey(row.values.codigo), phpIntValue(row.values.ciclo))
    fileCodes.set(importKey(row.values.codigo), row.line)
  }
  const cycles = PhpMap.merge(storedCycles, fileCycles)
  const modalities = new PhpMap<string>()
  for (const modality of STUDY_MODALITIES) modalities.set(importKey(modality), modality)
  const seen = new PhpMap<number>()
  const checked: CheckedRow[] = []
  const payloads: CurriculumPayload[] = []
  for (const row of rows) {
    const values = row.values
    const errors: string[] = []
    const code = values.codigo.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "")
    const codeKey = importKey(code)
    if (code === "" || phpLength(code) > 80) errors.push("El código es obligatorio y admite hasta 80 caracteres.")
    else if (existing.has(codeKey)) errors.push("La malla ya tiene una materia con este código.")
    else if (seen.has(codeKey)) errors.push(`El código se repite en la fila ${seen.get(codeKey)}.`)
    if (!seen.has(codeKey)) seen.set(codeKey, row.line)
    const name = values.nombre.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "")
    if (name === "" || phpLength(name) > 180) errors.push("El nombre es obligatorio y admite hasta 180 caracteres.")
    const cycle = values.ciclo.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "")
    if (!ctypeDigit(cycle) || phpIntValue(cycle) < 1 || phpIntValue(cycle) > career.cycleCount) errors.push(`El ciclo debe estar entre 1 y ${career.cycleCount}.`)
    const unit = unitFromText(values.unidad)
    if (unit === null) errors.push("La unidad de organización no es válida.")
    const modalityText = values.modalidad.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "")
    const modality = modalityText === "" ? null : (modalities.get(importKey(values.modalidad)) ?? null)
    if (modalityText !== "" && modality === null) errors.push("La modalidad no es válida.")
    const syllabusKey = importKey(values.genera_silabo)
    if (!["", importKey(YES), importKey(NO)].includes(syllabusKey)) errors.push("Genera sílabo debe ser Sí o No.")
    const numbers: Record<string, number> = {}
    for (const [key, label] of [
      ["acd", "Horas ACD"],
      ["ape", "Horas APE"],
      ["aa", "Horas AA"],
      ["creditos", "Créditos"],
    ]) {
      const value = values[key].replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "").replace(/,/g, ".")
      if (!phpIsNumeric(value) || phpAddZero(value) < 0) errors.push(`${label} debe ser un número mayor o igual a 0.`)
      numbers[key] = phpIsNumeric(value) ? phpAddZero(value) : 0
    }
    const relations: CurriculumPayload["relations"] = []
    for (const [column, type] of [
      ["prerrequisitos", "prerrequisito"],
      ["correquisitos", "correquisito"],
    ]) {
      for (const requirement of codes(values[column])) {
        const requirementKey = importKey(requirement)
        const requirementCycle = cycles.get(requirementKey) ?? 0
        if (requirementKey === codeKey) errors.push("Una materia no puede ser requisito de sí misma.")
        else if (!existing.has(requirementKey) && !fileCodes.has(requirementKey)) errors.push(`El requisito ${requirement} no está en la malla ni en el archivo.`)
        else if (type === "prerrequisito" && requirementCycle >= phpIntValue(cycle)) errors.push(`El prerrequisito ${requirement} debe estar en un ciclo anterior.`)
        else if (type === "correquisito" && requirementCycle !== phpIntValue(cycle)) errors.push(`El correquisito ${requirement} debe estar en el mismo ciclo.`)
        else relations.push({ code: requirementKey, type })
      }
    }
    checked.push({ ...row, errors })
    payloads.push({
      key: codeKey,
      relations,
      data: {
        code,
        nombre: name,
        cycle: phpIntValue(cycle),
        organization_unit: unit,
        modality,
        generates_syllabus: syllabusKey !== importKey(NO),
        horas_ac: numbers.acd,
        horas_pae: numbers.ape,
        horas_aa: numbers.aa,
        creditos: numbers.creditos,
        horas_totales: Math.round(numbers.acd + numbers.ape + numbers.aa),
      },
    })
  }
  return { checked, payloads, existing }
}

export async function importCurriculum(request: Request, deps: StructureImportDeps): Promise<Response> {
  const ready = await importSession(request, deps, 10)
  if (ready instanceof Response) return ready
  const { session, original, finish } = ready
  const upload = await spreadsheetUpload(request)
  if (upload instanceof Response) return finish(upload)
  const career = await curriculumCareer(session, deps)
  if (career === null) return finish(forbiddenWith(CURRICULUM_FORBIDDEN))
  const rows = importRows(upload.file, CURRICULUM_COLUMNS, CURRICULUM_OPTIONAL)
  if (rows instanceof Response) return finish(rows)
  const { checked, payloads, existing } = await checkCurriculum(rows, career, deps)
  const valid = checked.every((row) => row.errors.length === 0)
  if (!upload.confirm || !valid) return finish(apiJson({ rows: checked, valid, created: 0 } satisfies ImportResult))
  const context: CareerContext = { session, careerId: career.id }
  return finish(
    await settle(original, deps, async () => {
      const created = await deps.curriculum(async ({ subjects, requirements }) => {
        const ids = new PhpMap<string>()
        for (const [key, value] of existing.entries) ids.entries.set(key, value)
        let count = 0
        for (const payload of payloads) {
          ids.set(payload.key, await insertCareerSubject(subjects, context, payload.data))
          count++
        }
        for (const payload of payloads) {
          for (const relation of payload.relations) {
            await curriculumMutation(
              requirements,
              context,
              career.id,
              { subject_id: ids.get(payload.key) as string, requirement_id: ids.get(relation.code) as string, type: relation.type, confirm_purge: upload.input.confirm_purge ?? null },
              addRequirement,
            )
          }
        }
        return count
      })
      return apiJson({ rows: checked, valid, created } satisfies ImportResult)
    }),
  )
}
