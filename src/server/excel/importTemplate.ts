import { columnLetter } from "./workbook"
import { randomPasswordHash, SharedStrings, SHEET_FORMAT, WORKSHEET_CLOSE, WORKSHEET_OPEN, xlsxPackage, XML_HEADER, xmlAttribute } from "./phpSpreadsheetXlsx"
import { MAX_ROWS } from "./spreadsheetReader"

const STYLES =
  XML_HEADER +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="0"/><fonts count="3"><font><b val="0"/><i val="0"/><strike val="0"/><u val="none"/><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/></font><font><b val="1"/><i val="0"/><strike val="0"/><u val="none"/><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/></font><font><b val="0"/><i val="0"/><strike val="0"/>' +
  '<u val="none"/><sz val="11"/><color rgb="FF64748B"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor rgb="FF000000"/></patternFill></fill></fills><borders count="4"><border><left/><right/><top/><bottom/><diagonal/></border><border>' +
  '<left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/>' +
  '</right><top/><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf xfId="0" fontId="0" numFmtId="0" fillId="0" borderId="0" applyFont="0" applyNumberFormat="0" applyFill="0" applyBorder="0" applyAlignment="0"/><xf xfId="0" fontId="1" numFmtId="0" fillId="2" borderId="0" applyFont="1" applyNumberFormat="0" applyFill="1" applyBorder="0" applyAlignment="0"/>' +
  '<xf xfId="0" fontId="1" numFmtId="0" fillId="0" borderId="1" applyFont="1" applyNumberFormat="0" applyFill="0" applyBorder="1" applyAlignment="0"/><xf xfId="0" fontId="2" numFmtId="0" fillId="0" borderId="2" applyFont="1" applyNumberFormat="0" applyFill="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" textRotation="0" wrapText="true" shrinkToFit="false"/></xf><xf xfId="0" fontId="2" numFmtId="0" fillId="0" borderId="3" applyFont="1" applyNumberFormat="0" applyFill="0" applyBorder="1" applyAlignment="1">' +
  '<alignment vertical="top" textRotation="0" wrapText="true" shrinkToFit="false"/></xf><xf xfId="0" fontId="0" numFmtId="0" fillId="0" borderId="0" applyFont="0" applyNumberFormat="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="true"><protection locked="false"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles defaultTableStyle="TableStyleMedium9" defaultPivotStyle="PivotTableStyle1"/>' +
  '</styleSheet>'

const HEADER = 1
const NOTES_HEADER = 2
const NOTES_BODY = 3
const NOTES_END = 4
const UNLOCKED = 5
const LAST_ROW = MAX_ROWS + 1

export type TemplateSelect = { column: number; options: string[] }

export type TemplateOptions = { now: number; passwordHash?: () => string }

function cell(reference: string, style: number, text: number | null): string {
  const styled = style === 0 ? "" : ` s="${style}"`
  return text === null ? `<c r="${reference}"${styled}/>` : `<c r="${reference}"${styled} t="s"><v>${text}</v></c>`
}

function width(header: string): number {
  return Math.max(18, [...header].length + 4)
}

function dataSheet(headers: string[], selects: TemplateSelect[], notes: string[], strings: SharedStrings, password: string): string {
  const columns = headers.length
  const noteColumn = columns + 2
  const note = columnLetter(noteColumn)
  const lastRow = Math.max(10, notes.length * 2 + 2)
  const headerIndexes = headers.map((header) => strings.index(header))
  const notesHeader = strings.index("Indicaciones")
  const notesText = strings.index(notes.join("\n\n"))
  const cols =
    headers.map((header, index) => `<col min="${index + 1}" max="${index + 1}" width="${width(header)}" customWidth="true" style="0"/>`).join("") +
    `<col min="${noteColumn}" max="${noteColumn}" width="70" customWidth="true" style="0"/>`
  let rows = ""
  for (let row = 1; row <= Math.max(LAST_ROW, lastRow); row++) {
    let cells = ""
    for (let column = 1; column <= columns; column++) {
      const reference = `${columnLetter(column)}${row}`
      if (row === 1) cells += cell(reference, HEADER, headerIndexes[column - 1])
      else if (row <= LAST_ROW) cells += cell(reference, UNLOCKED, null)
    }
    if (row === 1) cells += cell(`${note}1`, NOTES_HEADER, notesHeader)
    else if (row === 2) cells += cell(`${note}2`, NOTES_BODY, notesText)
    else if (row < lastRow) cells += cell(`${note}${row}`, NOTES_BODY, null)
    else if (row === lastRow) cells += cell(`${note}${row}`, NOTES_END, null)
    rows += `<row r="${row}" spans="1:${noteColumn}">${cells}</row>`
  }
  const validations = selects.filter((select) => select.options.length > 0)
  let validationXml = ""
  for (const select of validations) {
    const letter = columnLetter(select.column + 1)
    const formula = `Listas!$${letter}$1:$${letter}$${select.options.length}`
    for (let row = 2; row <= LAST_ROW; row++) {
      validationXml +=
        '<dataValidation type="list" errorStyle="stop" operator="between" allowBlank="1" showDropDown="0" showInputMessage="0" showErrorMessage="1" errorTitle="Valor no válido" error="Elija una opción de la lista." ' +
        `sqref="${letter}${row}"><formula1>${xmlAttribute(formula)}</formula1></dataValidation>`
    }
  }
  const dataValidations = validations.length === 0 ? "" : `<dataValidations count="${validations.length * MAX_ROWS}">${validationXml}</dataValidations>`
  return (
    WORKSHEET_OPEN +
    `<dimension ref="A1:${note}${Math.max(LAST_ROW, lastRow)}"/>` +
    '<sheetViews><sheetView tabSelected="1" workbookViewId="0" showGridLines="true" showRowColHeaders="1">' +
    `<pane ySplit="1" activePane="bottomLeft" state="frozen" topLeftCell="A2"/><selection pane="bottomLeft" activeCell="A2" sqref="A2:${columnLetter(columns)}${LAST_ROW}"/></sheetView></sheetViews>` +
    SHEET_FORMAT +
    `<cols>${cols}</cols><sheetData>${rows}</sheetData>` +
    `<sheetProtection password="${password}" sheet="1"/>` +
    `<mergeCells><mergeCell ref="${note}2:${note}${lastRow}"/></mergeCells>` +
    dataValidations +
    WORKSHEET_CLOSE
  )
}

function listsSheet(selects: TemplateSelect[], strings: SharedStrings, password: string): string {
  const cells = new Map<number, Map<number, number>>()
  let highestColumn = 0
  for (const select of selects) {
    select.options.forEach((option, index) => {
      const row = cells.get(index + 1) ?? new Map<number, number>()
      row.set(select.column + 1, strings.index(option))
      cells.set(index + 1, row)
      highestColumn = Math.max(highestColumn, select.column + 1)
    })
  }
  const highestRow = Math.max(0, ...cells.keys())
  let rows = ""
  for (let row = 1; row <= highestRow; row++) {
    const values = cells.get(row)
    if (values === undefined) continue
    const ordered = [...values.entries()].sort(([left], [right]) => left - right)
    rows += `<row r="${row}" spans="1:${highestColumn}">${ordered.map(([column, text]) => cell(`${columnLetter(column)}${row}`, 0, text)).join("")}</row>`
  }
  const dimension = highestRow === 0 ? "A1:A1" : `A1:${columnLetter(highestColumn)}${highestRow}`
  return (
    WORKSHEET_OPEN +
    `<dimension ref="${dimension}"/>` +
    '<sheetViews><sheetView tabSelected="0" workbookViewId="0" showGridLines="true" showRowColHeaders="1"><selection activeCell="A1" sqref="A1"/></sheetView></sheetViews>' +
    SHEET_FORMAT +
    (rows === "" ? "<sheetData/>" : `<sheetData>${rows}</sheetData>`) +
    `<sheetProtection password="${password}" sheet="1"/>` +
    WORKSHEET_CLOSE
  )
}

export async function importTemplate(headers: string[], selects: TemplateSelect[], notes: string[], options: TemplateOptions): Promise<Buffer> {
  const strings = new SharedStrings()
  const hash = options.passwordHash ?? (() => randomPasswordHash())
  const data = dataSheet(headers, selects, notes, strings, hash())
  const lists = listsSheet(selects, strings, hash())
  return xlsxPackage({
    sheets: [
      { title: "Datos", xml: data },
      { title: "Listas", state: "hidden", xml: lists },
    ],
    sharedStrings: strings,
    styles: STYLES,
    created: options.now,
  })
}
