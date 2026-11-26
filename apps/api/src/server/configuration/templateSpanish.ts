import { isRecord, type PhpRecord } from "./phpValues"

type Shape = { keys?: Record<string, Entry>; each?: Shape }
type Entry = { es: string; shape?: Shape; values?: Record<string, string> }

const ALIGNMENTS = { left: "izquierda", center: "centro", right: "derecha", justify: "justificado" }

const SOURCES: Record<string, string> = {
  "identification.faculty": "identificacion.facultad",
  "identification.career": "identificacion.carrera",
  "identification.curriculum": "identificacion.malla",
  "identification.subject": "identificacion.asignatura",
  "identification.code": "identificacion.codigo",
  "identification.modality": "identificacion.modalidad",
  "identification.teacher_campus": "identificacion.campus_docente",
  "identification.period": "identificacion.periodo",
  "identification.cycle": "identificacion.ciclo",
  "identification.parallel": "identificacion.paralelo",
  "identification.shift": "identificacion.jornada",
  "identification.prerequisites": "identificacion.prerrequisitos",
  "identification.teacher_corequisites": "identificacion.correquisitos_docente",
  "identification.organization_unit": "identificacion.unidad_organizacion",
  "identification.hours_ac": "identificacion.horas_acd",
  "identification.hours_pae": "identificacion.horas_ape",
  "identification.hours_aa": "identificacion.horas_aa",
  "identification.total_hours": "identificacion.horas_totales",
  "identification.credits": "identificacion.creditos",
  "identification.teaching_weeks": "identificacion.semanas_clase",
  "identification.teacher": "identificacion.docente",
  "identification.email": "identificacion.correo",
  "identification.formation": "identificacion.formacion",
  "approval.submitted_on": "aprobacion.enviado_el",
  "approval.coordinator": "aprobacion.coordinador",
  "approval.approved_on": "aprobacion.aprobado_el",
  "approval.librarian": "aprobacion.bibliotecario",
  "approval.verified_on": "aprobacion.verificado_el",
  "signature.docente": "firma.docente",
  "signature.coordinacion": "firma.coordinacion",
  "signature.biblioteca": "firma.biblioteca",
}

function entry(es: string, shape?: Shape, values?: Record<string, string>): Entry {
  return { es, shape, values }
}

const SIZES: Shape = { keys: { title: entry("titulo"), section: entry("seccion"), body: entry("texto") } }

const DOCUMENT: Shape = {
  keys: {
    paper: entry("papel", undefined, { letter: "carta", a4: "a4", legal: "oficio" }),
    orientation: entry("orientacion", undefined, { portrait: "vertical", landscape: "horizontal" }),
    margin_cm: entry("margen_cm"),
    font_family: entry("letra"),
    line_height: entry("interlineado"),
    paragraph_spacing_pt: entry("espacio_parrafos_pt"),
    sizes: entry("tamaños", SIZES),
    colors: entry("colores", {
      keys: {
        text: entry("texto"),
        title: entry("titulo"),
        table_header_background: entry("fondo_encabezado_tabla"),
        table_header_text: entry("texto_encabezado_tabla"),
        table_border: entry("borde_tabla"),
        empty_text: entry("texto_vacio"),
      },
    }),
    title: entry("titulo", { keys: { text: entry("texto"), bold: entry("negrita"), italic: entry("cursiva"), alignment: entry("alineacion", undefined, ALIGNMENTS) } }),
    section_title: entry("titulo_seccion", { keys: { bold: entry("negrita"), italic: entry("cursiva"), alignment: entry("alineacion", undefined, ALIGNMENTS) } }),
    body: entry("texto", { keys: { alignment: entry("alineacion", undefined, ALIGNMENTS) } }),
    header: entry("encabezado", {
      keys: {
        logos: entry("logos", { each: { keys: { source: entry("fuente", undefined, { institution: "institucion", faculty: "facultad" }), height_pt: entry("alto_pt") } } }),
        left_share: entry("proporcion_izquierda"),
      },
    }),
    footer: entry("pie"),
    metadata: entry("metadatos"),
    empty_text: entry("texto_vacio"),
    choices: entry("opciones", { keys: { margin_cm: entry("margen_cm"), title: entry("titulo"), section: entry("seccion"), body: entry("texto") } }),
  },
}

const VARIABLE: Shape = {
  keys: {
    label: entry("etiqueta"),
    source: entry("fuente", undefined, SOURCES),
    sample: entry("ejemplo"),
    format: entry("formato", undefined, { number: "numero" }),
    equals: entry("igual_a"),
  },
}

const PRESET: Shape = { keys: { key: entry("clave"), label: entry("etiqueta"), field: entry("campo"), quien_llena: entry("quien_llena"), content: entry("contenido") } }

const FIELD: Shape = {
  keys: {
    key: entry("clave"),
    label: entry("etiqueta"),
    quien_llena: entry("quien_llena"),
    content: entry("contenido"),
    show_if: entry("mostrar_si", { keys: { response: entry("respuesta"), options: entry("opciones") } }),
    max_length: entry("max_caracteres"),
  },
}

const SECTION: Shape = {
  keys: {
    key: entry("clave"),
    title: entry("titulo"),
    orientation: entry("orientacion", undefined, { portrait: "vertical", landscape: "horizontal" }),
    fields: entry("campos", { each: FIELD }),
  },
}

const TEMPLATE: Shape = {
  keys: {
    version: entry("versión"),
    response_policy: entry("politica_respuestas", undefined, { protected: "protegida" }),
    document: entry("documento", DOCUMENT),
    variables: entry("variables", { each: VARIABLE }),
    blocks: entry("tablas"),
    required_sections: entry("secciones_obligatorias"),
    library_sections: entry("secciones_biblioteca"),
    teacher_fields: entry("campos_docente"),
    presets: entry("contenidos_predefinidos", { each: PRESET }),
    sections: entry("secciones", { each: SECTION }),
  },
}

const SPANISH_ROOTS = Object.values(TEMPLATE.keys ?? {})
  .map((item) => item.es)
  .filter((name) => !Object.prototype.hasOwnProperty.call(TEMPLATE.keys, name))
const ROOT_PATH = new RegExp(`(?<![\\w.])(${Object.keys(TEMPLATE.keys ?? {}).join("|")})((?:\\.[\\w*-]+)*)(?![\\wñ])`, "g")

function englishName(shape: Shape, name: string): string {
  const keys = shape.keys ?? {}
  if (Object.prototype.hasOwnProperty.call(keys, name)) return name
  return Object.entries(keys).find(([, item]) => item.es === name)?.[0] ?? name
}

function englishValue(values: Record<string, string>, value: string): string {
  if (Object.prototype.hasOwnProperty.call(values, value)) return value
  return Object.entries(values).find(([, spanish]) => spanish === value)?.[0] ?? value
}

function translated(value: unknown, shape: Shape | undefined, toSpanish: boolean): unknown {
  if (shape === undefined) return value
  if (shape.each !== undefined) {
    if (Array.isArray(value)) return value.map((item) => translated(item, shape.each, toSpanish))
    if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, translated(item, shape.each, toSpanish)]))
    return value
  }
  if (!isRecord(value) || shape.keys === undefined) return value
  const keys = shape.keys
  const result: PhpRecord = {}
  for (const [name, item] of Object.entries(value)) {
    const english = toSpanish ? name : englishName(shape, name)
    const found = Object.prototype.hasOwnProperty.call(keys, english) ? keys[english] : undefined
    if (found === undefined) {
      result[name] = item
      continue
    }
    let inner = translated(item, found.shape, toSpanish)
    if (found.values !== undefined && typeof inner === "string") {
      inner = toSpanish ? (found.values[inner] ?? inner) : englishValue(found.values, inner)
    }
    result[toSpanish ? found.es : english] = inner
  }
  return result
}

export function templateInSpanish(template: PhpRecord): PhpRecord {
  return translated(template, TEMPLATE, true) as PhpRecord
}

export function templateFromAnyLanguage(input: PhpRecord): PhpRecord {
  return translated(input, TEMPLATE, false) as PhpRecord
}

export function writtenInSpanish(input: unknown): boolean {
  return isRecord(input) && SPANISH_ROOTS.some((name) => Object.prototype.hasOwnProperty.call(input, name))
}

function entryAt(segments: string[]): { path: string[]; found: Entry | null; shape: Shape | undefined } {
  const path: string[] = []
  let shape: Shape | undefined = TEMPLATE
  let found: Entry | null = null
  for (const [index, segment] of segments.entries()) {
    if (shape === undefined) return { path: [...path, ...segments.slice(index)], found: null, shape: undefined }
    if (shape.each !== undefined) {
      path.push(segment)
      shape = shape.each
      found = null
      continue
    }
    const item: Entry | undefined = shape.keys !== undefined && Object.prototype.hasOwnProperty.call(shape.keys, segment) ? shape.keys[segment] : undefined
    if (item === undefined) return { path: [...path, ...segments.slice(index)], found: null, shape: undefined }
    path.push(item.es)
    shape = item.shape
    found = item
  }
  return { path, found, shape }
}

function spanishPath(path: string): string {
  return entryAt(path.split(".")).path.join(".")
}

function wordsIn(text: string, words: Record<string, string>): string {
  return Object.entries(words).reduce((current, [english, spanish]) => current.replace(new RegExp(`(?<![\\w.])${english.replace(/[.*]/g, "\\$&")}(?![\\w])`, "g"), spanish), text)
}

function spanishMessage(message: string): string {
  const first = new RegExp(ROOT_PATH.source).exec(message)
  if (first === null) return message
  const { found, shape } = entryAt(first[0].split("."))
  const end = first.index + first[0].length
  const head = message.slice(0, end).replace(ROOT_PATH, (path) => spanishPath(path))
  let rest = message.slice(end).replace(ROOT_PATH, (path) => spanishPath(path))
  if (found?.values !== undefined) rest = wordsIn(rest, found.values)
  const keys = shape?.keys ?? shape?.each?.keys
  if (keys !== undefined) rest = wordsIn(rest, Object.fromEntries(Object.entries(keys).map(([english, item]) => [english, item.es])))
  return head + rest
}

export function errorsInSpanish(errors: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(errors).map(([path, messages]) => [spanishPath(path), messages.map(spanishMessage)]))
}

function repeated(value: unknown, shape: Shape | undefined, path: string, found: Record<string, string[]>): void {
  if (shape === undefined) return
  const at = (key: string): string => (path === "" ? key : `${path}.${key}`)
  if (shape.each !== undefined) {
    if (Array.isArray(value)) value.forEach((item, index) => repeated(item, shape.each, at(String(index)), found))
    else if (isRecord(value)) for (const [key, item] of Object.entries(value)) repeated(item, shape.each, at(key), found)
    return
  }
  if (!isRecord(value) || shape.keys === undefined) return
  const seen = new Map<string, string>()
  for (const [name, item] of Object.entries(value)) {
    const english = englishName(shape, name)
    const entry = Object.prototype.hasOwnProperty.call(shape.keys, english) ? shape.keys[english] : undefined
    if (entry === undefined) continue
    const other = seen.get(english)
    if (other !== undefined) found[at(entry.es)] = [`«${entry.es}» y «${other === entry.es ? name : other}» son el mismo dato: deje solo uno.`]
    else seen.set(english, name)
    repeated(item, entry.shape, at(entry.es), found)
  }
}

export function repeatedKeys(input: PhpRecord): Record<string, string[]> {
  const found: Record<string, string[]> = {}
  repeated(input, TEMPLATE, "", found)
  return found
}
