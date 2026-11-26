import { FORMATION_FIELD } from "@silabos/shared/lib/teacherFormation"
import { Prisma } from "../../generated/prisma/client"
import { definitionHash } from "../ficha/definitionHash"
import { isPhpArray, list, phpJsonDecode, phpTrim, record, type PhpRecord } from "../configuration/phpValues"
import { isCareerField, isTeacherField, templateFields, type SyllabusTemplate } from "../configuration/templatePresentation"
import { isDocument, plainText, type TemplateDefinition } from "../configuration/templateRuntime"
import { draftTx } from "./draftFieldStore"
import { SYLLABUS_EXISTS, writtenBySql } from "./syllabusSql"
import { rowsOf, type Executor } from "./teacherSyllabusQueries"

export { isTeacherField, teacherFieldKeys } from "../configuration/templatePresentation"
export { FORMATION_FIELD }


const TEXT_ONLY: TemplateDefinition = { document: {}, variables: {}, blocks: {} }
const LINE_ATTRS = { textAlign: "left" }

export function fieldFingerprint(content: unknown): string {
  return definitionHash(content)
}

export function documentText(value: unknown): string {
  return isDocument(value) ? phpTrim(plainText(value, TEXT_ONLY)) : ""
}

export function formationDocument(text: string): PhpRecord {
  return {
    type: "doc",
    content: text.split("\n").map((line) => (line === "" ? { type: "paragraph", attrs: LINE_ATTRS } : { type: "paragraph", attrs: LINE_ATTRS, content: [{ type: "text", text: line }] })),
  }
}

export function joinedDocuments(documents: unknown[]): PhpRecord | null {
  const seen: string[] = []
  const content: unknown[] = []
  for (const document of documents) {
    const text = documentText(document)
    if (text === "" || seen.includes(text)) continue
    if (seen.length > 0) content.push({ type: "paragraph" })
    seen.push(text)
    content.push(...list(record(document).content))
  }
  return seen.length === 0 ? null : { type: "doc", content }
}

const FIELD_OF_VALUE = Prisma.sql`inner join definiciones_campo on definiciones_campo.definicion_campo_id = valores_campo.definicion_campo_id
  inner join campos_plantilla on campos_plantilla.campo_plantilla_id = definiciones_campo.campo_plantilla_id`

async function lastWritten(executor: Executor, syllabusId: string, key: string, fingerprint: string, teacherId: string): Promise<unknown> {
  const rows = await rowsOf<{ value: string | null }>(
    executor,
    Prisma.sql`select valores_campo.valor_campo::text as value from valores_campo ${FIELD_OF_VALUE}
        inner join silabos on silabos.silabo_id = valores_campo.silabo_id
      where campos_plantilla.clave_campo_plantilla = ${key} and valores_campo.huella_definicion_campo = ${fingerprint}
        and silabos.silabo_id <> ${syllabusId}::uuid and ${writtenBySql(teacherId)} and ${SYLLABUS_EXISTS}
      order by silabos.guardado_en desc nulls last, silabos.silabo_id desc`,
  )
  return rows.map((row) => phpJsonDecode(row.value)).find((value) => documentText(value) !== "") ?? null
}

export async function carriedValue(executor: Executor, syllabusId: string, key: string, fingerprint: string): Promise<PhpRecord | null> {
  const teachers = await rowsOf<{ id: string }>(
    executor,
    Prisma.sql`select docentes_vigentes_silabo.usuario_id::text as id from docentes_vigentes_silabo
      where docentes_vigentes_silabo.silabo_id = ${syllabusId}::uuid order by docentes_vigentes_silabo.usuario_id`,
  )
  const written: unknown[] = []
  for (const teacher of teachers) written.push(await lastWritten(executor, syllabusId, key, fingerprint, teacher.id))
  return joinedDocuments(written)
}

export async function carryTeacherFields(executor: Executor, syllabusId: string, template: SyllabusTemplate, newId: () => string): Promise<void> {
  const fields = templateFields(template).filter((field) => isCareerField(field) && isTeacherField(field, template.definition))
  for (const field of fields) {
    const [current] = await rowsOf<{ id: string; value: string | null }>(
      executor,
      Prisma.sql`select valores_campo.valor_campo_id as id, valores_campo.valor_campo::text as value from valores_campo
        where valores_campo.silabo_id = ${syllabusId}::uuid and valores_campo.definicion_campo_id = ${field.id}::uuid limit 1`,
    )
    if (current !== undefined && documentText(phpJsonDecode(current.value)) !== "") continue
    const fingerprint = fieldFingerprint(field.content)
    const carried = await carriedValue(executor, syllabusId, field.key, fingerprint)
    if (carried !== null) await draftTx(executor).saveValue(syllabusId, field.id, carried, newId(), fingerprint)
  }
}

export async function formationOf(executor: Executor, syllabusId: string): Promise<string | null> {
  const [row] = await rowsOf<{ value: string | null }>(
    executor,
    Prisma.sql`select valores_campo.valor_campo::text as value from valores_campo ${FIELD_OF_VALUE}
      where valores_campo.silabo_id = ${syllabusId}::uuid and campos_plantilla.clave_campo_plantilla = ${FORMATION_FIELD}
      order by definiciones_campo.vigente_en_plantilla desc, campos_plantilla.vigente_en_plantilla desc limit 1`,
  )
  if (row === undefined) return null
  const value = phpJsonDecode(row.value)
  return isPhpArray(value) ? documentText(value) : null
}
