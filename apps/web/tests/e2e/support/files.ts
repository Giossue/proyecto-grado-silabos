import fs from "node:fs"
import path from "node:path"
import ExcelJS from "exceljs"
import JSZip from "jszip"

export function writePdf(directory: string, name: string, text: string): string {
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]
  let body = "%PDF-1.4\n"
  const offsets: number[] = []
  objects.forEach((object, index) => {
    offsets.push(body.length)
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  const file = path.join(directory, name)
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(file, body)
  return file
}

export async function writeDocx(directory: string, name: string, text: string): Promise<string> {
  const zip = new JSZip()
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  )
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  )
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  )
  const file = path.join(directory, name)
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
  return file
}

export async function describeWorkbook(file: string): Promise<string> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(file)
  return workbook.worksheets
    .map((sheet) => `${sheet.name} [${sheet.state}]: ${[1, 2, 3, 4].map((row) => JSON.stringify(sheet.getRow(row).values)).join(" | ")}`)
    .join("\n")
}

export async function appendWorkbookRow(source: string, target: string, header: RegExp, values: Record<string, string>): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(source)
  for (const sheet of workbook.worksheets) {
    if (sheet.state !== "visible") continue
    for (let row = 1; row <= Math.min(sheet.rowCount, 10); row += 1) {
      const cells = sheet.getRow(row).values as unknown[]
      if (!cells.some((cell) => typeof cell === "string" && header.test(cell))) continue
      const target_row = sheet.getRow(row + 1).values && (sheet.getRow(row + 1).values as unknown[]).some((cell) => cell !== null && cell !== undefined) ? sheet.rowCount + 1 : row + 1
      cells.forEach((cell, column) => {
        if (typeof cell !== "string") return
        const entry = Object.entries(values).find(([label]) => cell.toLowerCase().startsWith(label.toLowerCase()))
        if (entry) sheet.getRow(target_row).getCell(column).value = /^\d+$/.test(entry[1]) ? Number(entry[1]) : entry[1]
      })
      await workbook.xlsx.writeFile(target)
      return
    }
  }
  throw new Error(`No header row matches ${header}`)
}
