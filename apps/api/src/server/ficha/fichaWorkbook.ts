import { createHash } from "node:crypto"
import { listTable, blank, plainText, TemplateValidationError, type TemplateDefinition } from "../configuration/templateRuntime"
import { isPhpArray, list, mbStrlen, phpTrim, record, type PhpRecord } from "../configuration/phpValues"
import { collectStyles, StyledSheet, StyleBook, TEXT_FORMAT, type CellStyle } from "../excel/phpSpreadsheetSheet"
import { columnName, listWorksheetInfo, loadWorkbook, workbookArchiveSize, type Book, type BookSheet, type WorksheetInfo } from "../excel/phpSpreadsheetReader"
import { randomPasswordHash, SharedStrings, xlsxPackage } from "../excel/phpSpreadsheetXlsx"
import { fichaClean, type FichaValue } from "./fichaFieldValues"

export const FICHA_FORMAT = "ficha_xlsx_v1"

const TABLE_ROWS = 40
const MAX_CELLS = 250000
const MAX_ARCHIVE_BYTES = 150 * 1024 * 1024
const GUIDE = "Indicaciones"
const META = "_estructura"
const EMPTY_DEFINITION = { document: {}, variables: {}, blocks: {} } as unknown as TemplateDefinition
const BULLET = /^[ \t\n\x0B\f\r]*(?:[-*•][ \t\n\x0B\f\r]+|\d+[.)][ \t\n\x0B\f\r]+)/u
const LINE_BREAK = /\r\n|[\n\v\f\r\u0085\u2028\u2029]/u

export type FichaField = {
  key: string
  label: string
  columns: string[]
  table: PhpRecord | null
  id: string
  section: string
  sheet: string
  definition_hash: string
}

export type FichaSubject = { id: string; code: string; name: string; cycle: number | null }

export type FichaDefinition = { careerId: string; careerName: string; fields: FichaField[]; subjects: FichaSubject[] }

export type FichaEntry = {
  subject_id: string
  code: string
  name: string
  cycle: number | null
  state: "lista" | "sin_evidencia"
  values: Record<string, FichaValue>
  error: null
}

export type FichaWorkbookOptions = { now: number; passwordHash?: () => string }

function fail(message: string, sheet: string | null = null, cell: string | null = null): never {
  const location = sheet === null ? "" : `Hoja «${sheet}»${cell === null ? "" : `, celda ${cell}`}: `
  throw new TemplateValidationError({ file: [location + message] })
}

function jsonUnescapedUnicode(value: unknown): string {
  return JSON.stringify(value).replace(/[/\u2028\u2029]/g, (character) => (character === "/" ? "\\/" : `\\u${character.charCodeAt(0).toString(16)}`))
}

export function fichaFingerprint(definition: FichaDefinition): string {
  const fields = definition.fields.map((field) => ({
    key: field.key,
    label: field.label,
    columns: field.columns,
    table: field.table,
    id: field.id,
    section: field.section,
    sheet: field.sheet,
    definition_hash: field.definition_hash,
  }))
  const subjects = definition.subjects.map((subject) => ({ id: subject.id, code: subject.code, name: subject.name, cycle: subject.cycle }))
  return createHash("sha256").update(jsonUnescapedUnicode([definition.careerId, fields, subjects]), "utf8").digest("hex")
}

function body(table: PhpRecord): unknown[] {
  return list(table.content ?? []).filter((row) => !list(record(row).content ?? []).every((cell) => record(cell).type === "tableHeader"))
}

function slots(field: FichaField): number {
  if (field.columns.length === 0) return 1
  const table = field.table
  if (!isPhpArray(table) || listTable(table)) return TABLE_ROWS
  return Math.max(1, body(table).length)
}

function fixedCell(field: FichaField, row: number, column: number): string | null {
  const table = field.table
  if (!isPhpArray(table) || listTable(table)) return null
  const line = body(table)[row]
  const cell = line === undefined ? undefined : list(record(line).content ?? [])[column]
  if (!isPhpArray(cell) || blank(cell)) return null
  return phpTrim(plainText({ type: "doc", content: record(cell).content ?? [] }, EMPTY_DEFINITION))
}

function headers(columns: string[]): string[] {
  return ["Referencia", "Código", "Asignatura", ...(columns.length === 0 ? ["Contenido"] : columns)]
}

function assertSize(definition: FichaDefinition): void {
  let cells = 0
  for (const field of definition.fields) {
    cells += definition.subjects.length * (field.columns.length === 0 ? 4 : (3 + field.columns.length) * slots(field))
  }
  if (cells > MAX_CELLS) fail("La plantilla supera el tamaño que se puede procesar en una sola carga.")
}

const wrap = (style: CellStyle): CellStyle => ({ ...style, wrap: true })
const top = (style: CellStyle): CellStyle => ({ ...style, vertical: "top" })
const bold = (style: CellStyle): CellStyle => ({ ...style, bold: true })

export async function createFichaWorkbook(definition: FichaDefinition, options: FichaWorkbookOptions): Promise<Buffer> {
  assertSize(definition)
  const password = options.passwordHash ?? (() => randomPasswordHash())
  const book = new StyleBook()
  const guide = new StyledSheet(book, GUIDE)
  const guideRows = [
    ["Proyecto de carrera", definition.careerName],
    ["1", "Complete las celdas de contenido de cada hoja. Cada hoja corresponde a un campo de la plantilla."],
    ["2", "No cambie los nombres de las hojas, los encabezados ni los datos de las materias."],
    ["3", "Las celdas vacías conservan los valores actuales. No borran contenido del proyecto de carrera."],
    ["4", "Para listas, escriba un elemento por línea empezando con «- ». Para párrafos, use saltos de línea normales."],
    ["5", "Las tablas de listas admiten hasta 40 filas por materia. Las tablas fijas conservan sus filas y rótulos."],
    ["6", "Cargue el archivo en el sitio, revise la vista previa y confirme qué materias y campos aplicar."],
    ["7", "Si cambian los campos de la plantilla o las materias, descargue un Excel nuevo."],
  ]
  guideRows.forEach((cells, index) => cells.forEach((content, column) => guide.text(`${columnName(column + 1)}${index + 1}`, content)))
  guide.columnWidth(1, 25)
  guide.columnWidth(2, 95)
  guide.style("B1:B8", wrap)
  guide.style("B1:B8", top)
  for (let row = 2; row <= 8; row++) guide.rowHeight(row, 45)
  guide.style("A1:B1", bold)
  guide.password = password()
  const meta = new StyledSheet(book, META, "veryHidden")
  meta.text("A1", "UEB_FICHA_XLSX")
  meta.text("B1", FICHA_FORMAT)
  meta.text("A2", "Carrera")
  meta.text("B2", definition.careerId)
  meta.text("A3", "Estructura")
  meta.text("B3", fichaFingerprint(definition))
  const sheets = [guide, meta]
  for (const field of definition.fields) {
    const sheet = new StyledSheet(book, field.sheet)
    sheets.push(sheet)
    const titles = headers(field.columns)
    const lastColumn = columnName(titles.length)
    sheet.text("A1", field.id)
    sheet.text("B1", field.label)
    sheet.merge(`B1:${lastColumn}1`)
    sheet.text("B2", field.section)
    sheet.merge(`B2:${lastColumn}2`)
    titles.forEach((title, column) => sheet.text(`${columnName(column + 1)}3`, title))
    let row = 4
    const count = slots(field)
    for (const subject of definition.subjects) {
      for (let slot = 0; slot < count; slot++) {
        sheet.text(`A${row}`, subject.id)
        sheet.text(`B${row}`, subject.code)
        sheet.text(`C${row}`, subject.name)
        field.columns.forEach((_, column) => {
          const fixed = fixedCell(field, slot, column)
          if (fixed !== null) sheet.text(`${columnName(column + 4)}${row}`, fixed)
        })
        sheet.rowHeight(row, count === 1 ? 95 : 35)
        row++
      }
    }
    const range = `D4:${lastColumn}${row - 1}`
    sheet.style(range, (style) => ({ ...style, locked: "unprotected" }))
    for (let index = 4; index < row; index++) {
      field.columns.forEach((_, column) => {
        if (fixedCell(field, (index - 4) % count, column) !== null) sheet.style(`${columnName(column + 4)}${index}`, (style) => ({ ...style, locked: "protected" }))
      })
    }
    sheet.style(range, (style) => ({ ...style, format: TEXT_FORMAT }))
    sheet.style(`B1:${lastColumn}${row - 1}`, wrap)
    sheet.style(`B1:${lastColumn}${row - 1}`, top)
    sheet.style(`B1:${lastColumn}3`, bold)
    sheet.style(`B3:${lastColumn}3`, (style) => ({ ...style, fill: { ...style.fill, type: "solid" } }))
    sheet.style(`B3:${lastColumn}3`, (style) => ({ ...style, fill: { ...style.fill, start: "FFD9EAF0" } }))
    sheet.hideColumn(1)
    sheet.columnWidth(2, 20)
    sheet.columnWidth(3, 38)
    for (let column = 4; column <= titles.length; column++) sheet.columnWidth(column, field.columns.length === 0 ? 85 : 42)
    sheet.password = password()
    sheet.freezeAtD4()
  }
  const workbookPassword = password()
  const { styles, index } = collectStyles(book, sheets)
  const strings = new SharedStrings()
  return xlsxPackage({
    sheets: sheets.map((sheet, position) => ({ title: sheet.title, state: sheet.state, xml: sheet.write(strings, position === 0, index) })),
    sharedStrings: strings,
    styles,
    created: options.now,
    workbookPassword,
    preCalculateFormulas: false,
  })
}

function assertArchive(bytes: Buffer): void {
  let size: number
  try {
    size = workbookArchiveSize(bytes)
  } catch {
    return fail("Use un archivo Excel .xlsx válido.")
  }
  if (size > MAX_ARCHIVE_BYTES) fail("El archivo de Excel es demasiado grande para procesarlo.")
}

function assertDimensions(sheets: WorksheetInfo[], definition: FichaDefinition): void {
  const bounds = new Map<string, [number, number]>([
    [GUIDE, [8, 2]],
    [META, [3, 2]],
  ])
  for (const field of definition.fields) bounds.set(field.sheet, [3 + definition.subjects.length * slots(field), 3 + Math.max(1, field.columns.length)])
  const names = sheets.map((sheet) => sheet.worksheetName)
  const expected = [...bounds.keys()]
  if (names.length !== expected.length || names.some((name, index) => name !== expected[index])) {
    fail("Las hojas del Excel cambiaron. Descargue una plantilla nueva y conserve sus nombres y orden.")
  }
  for (const sheet of sheets) {
    const [rows, columns] = bounds.get(sheet.worksheetName) as [number, number]
    if (sheet.totalRows > rows || sheet.totalColumns > columns) fail("Hay datos fuera de las celdas de la plantilla. No agregue filas ni columnas.")
  }
}

function cell(sheet: BookSheet, address: string): string {
  const found = sheet.touch(address)
  if (found.formula) fail("No se admiten fórmulas. Escriba o pegue solo el contenido.", sheet.title, address)
  return found.value ?? ""
}

function expectCell(sheet: BookSheet, address: string, expected: string): void {
  if (cell(sheet, address) !== expected) fail("No modifique los encabezados ni los datos de las materias. Descargue una plantilla nueva si cambiaron.", sheet.title, address)
}

function textValue(text: string, sheet: BookSheet): string | string[] {
  const lines = text.split(LINE_BREAK).filter((line) => phpTrim(line) !== "")
  if (lines.length > 0 && lines.every((line) => BULLET.test(line))) {
    if (lines.length > 60 || lines.some((line) => mbStrlen(line) > 3000)) fail("La lista admite hasta 60 elementos de 3 000 caracteres.", sheet.title)
    return lines.map((line) => phpTrim(line.replace(BULLET, "")))
  }
  return text
}

function open(bytes: Buffer, definition: FichaDefinition): Book {
  try {
    assertDimensions(listWorksheetInfo(bytes), definition)
    return loadWorkbook(bytes)
  } catch (error) {
    if (error instanceof TemplateValidationError) throw error
    return fail("No se pudo abrir el Excel. Use el archivo .xlsx descargado desde el sitio.")
  }
}

export function readFichaWorkbook(bytes: Buffer, definition: FichaDefinition): FichaEntry[] {
  assertSize(definition)
  assertArchive(bytes)
  const book = open(bytes, definition)
  for (const sheet of book.sheets) {
    for (const [address, found] of sheet.cells) {
      if (found.formula) fail("No se admiten fórmulas. Escriba o pegue solo el contenido.", sheet.title, address)
    }
  }
  const expectedNames = [GUIDE, META, ...definition.fields.map((field) => field.sheet)]
  const names = book.sheets.map((sheet) => sheet.title)
  if (names.length !== expectedNames.length || names.some((name, index) => name !== expectedNames[index])) {
    fail("Las hojas del Excel cambiaron. Descargue una plantilla nueva y conserve sus nombres y orden.")
  }
  const byName = (name: string) => book.sheets.find((sheet) => sheet.title.toUpperCase() === name.toUpperCase()) ?? null
  const meta = byName(META)
  if (
    meta === null ||
    cell(meta, "A1") !== "UEB_FICHA_XLSX" ||
    cell(meta, "B1") !== FICHA_FORMAT ||
    cell(meta, "B2") !== definition.careerId ||
    cell(meta, "B3") !== fichaFingerprint(definition)
  ) {
    fail("El Excel no corresponde a la carrera o la estructura actual. Descargue una plantilla nueva.")
  }
  const values = new Map<string, Record<string, FichaValue>>()
  for (const field of definition.fields) {
    const sheet = byName(field.sheet)
    if (sheet === null) return fail("Falta una hoja de la plantilla. Descargue el Excel nuevamente.")
    const titles = headers(field.columns)
    if (cell(sheet, "A1") !== field.id || cell(sheet, "B1") !== field.label || cell(sheet, "B2") !== field.section) {
      fail("No cambie los títulos ni la identificación de los campos de la plantilla.")
    }
    titles.forEach((title, column) => expectCell(sheet, `${columnName(column + 1)}3`, title))
    let row = 4
    const count = slots(field)
    const repeats = field.table !== null && !listTable(field.table)
    for (const subject of definition.subjects) {
      const data: string[][] = []
      let hasAnswers = false
      for (let slot = 0; slot < count; slot++) {
        expectCell(sheet, `A${row}`, subject.id)
        expectCell(sheet, `B${row}`, subject.code)
        expectCell(sheet, `C${row}`, subject.name)
        const cells: string[] = []
        for (let column = 4; column <= titles.length; column++) {
          const address = `${columnName(column)}${row}`
          const content = phpTrim(cell(sheet, address))
          if (mbStrlen(content) > (field.columns.length === 0 ? 12000 : 1500)) fail("El contenido supera el límite permitido.", sheet.title, address)
          const fixed = fixedCell(field, slot, column - 4)
          if (fixed !== null) expectCell(sheet, address, fixed)
          else if (content !== "") hasAnswers = true
          cells.push(content)
        }
        if (repeats || cells.some((text) => text !== "")) data.push(cells)
        row++
      }
      if (data.length > 0 && hasAnswers) {
        const raw = field.columns.length === 0 ? textValue(data[0][0], sheet) : { rows: data }
        const value = fichaClean(raw, field.columns)
        if (value === null) fail("El contenido no tiene el formato de este campo.", sheet.title)
        const subjectValues = values.get(subject.id) ?? {}
        subjectValues[field.key] = value
        values.set(subject.id, subjectValues)
      }
    }
    if (sheet.highestDataRow() >= row || sheet.highestDataColumn() > titles.length) {
      fail("Hay datos fuera de las celdas de la plantilla. No agregue filas ni columnas.", sheet.title)
    }
  }
  if (values.size === 0) fail("Complete al menos un campo antes de cargar el Excel. Las celdas vacías no cambian el proyecto de carrera actual.")
  return definition.subjects.map((subject) => {
    const content = values.get(subject.id) ?? {}
    return {
      subject_id: subject.id,
      code: subject.code,
      name: subject.name,
      cycle: subject.cycle,
      state: Object.keys(content).length === 0 ? "sin_evidencia" : "lista",
      values: content,
      error: null,
    }
  })
}


