import { isPhpArray, isRecord, list, type PhpRecord } from "../configuration/phpValues"
import type { RevisionRecord } from "./coordinationReviews"

type FlatField = { section_key: string; section_title: string; field_key: string; label: string; quien_llena: unknown; value: unknown }

function arrayList(value: unknown): PhpRecord[] {
  if (!isPhpArray(value)) return []
  return list(value).filter((item) => isPhpArray(item)).map((item) => (Array.isArray(item) ? Object.fromEntries(item.map((entry, index) => [String(index), entry])) : (item as PhpRecord)))
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback
}

function flatten(snapshot: unknown): Map<string, FlatField> {
  const fields = new Map<string, FlatField>()
  const root = isRecord(snapshot) ? snapshot : {}
  for (const section of arrayList(root.sections)) {
    const sectionKey = stringOr(section.key, "")
    const sectionTitle = stringOr(section.title, sectionKey)
    const blocks = section.fields !== undefined && section.fields !== null ? [section] : arrayList(section.blocks)
    for (const block of blocks) {
      for (const field of arrayList(block.fields)) {
        const fieldKey = stringOr(field.key, "")
        if (sectionKey === "" || fieldKey === "") continue
        fields.set(`${sectionKey}.${fieldKey}`, {
          section_key: sectionKey,
          section_title: sectionTitle,
          field_key: fieldKey,
          label: stringOr(field.label, fieldKey),
          quien_llena: field.quien_llena ?? "docente",
          value: field.value ?? null,
        })
      }
    }
  }
  return fields
}

function byteOrder(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right))
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (isRecord(value)) {
    const keys = Object.keys(value).sort(byteOrder)
    if (keys.length === 0) return "[]"
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`
  }
  return value === undefined ? "null" : JSON.stringify(value)
}

export function revisionDiff(before: RevisionRecord, after: RevisionRecord) {
  const old = flatten(before.snapshot)
  const next = flatten(after.snapshot)
  const keys = [...new Set([...old.keys(), ...next.keys()])].sort(byteOrder)
  const changes: PhpRecord[] = []
  for (const key of keys) {
    const previous = old.get(key) ?? null
    const current = next.get(key) ?? null
    if (canonicalJson(previous) === canonicalJson(current)) continue
    const pick = (name: keyof FlatField, fallback: unknown) => current?.[name] ?? previous?.[name] ?? fallback
    changes.push({
      section_key: pick("section_key", ""),
      section_title: pick("section_title", ""),
      field_key: pick("field_key", ""),
      label: pick("label", ""),
      quien_llena: pick("quien_llena", "docente"),
      change: previous === null ? "added" : current === null ? "removed" : "modified",
      before: previous === null ? null : { value: previous.value },
      after: current === null ? null : { value: current.value },
    })
  }
  return { before_revision: before.number, after_revision: after.number, changed_fields: changes.length, changes }
}
