import { freeTextPlain, isFreeTextDocument, renderFreeText } from "@/components/domain/syllabus/freeTextRender"
import "./FreeTextContent.css"

type FreeTextContentProps = { value: unknown; emptyText?: string }

export function FreeTextContent({ value, emptyText = "Sin contenido" }: FreeTextContentProps) {
  if ((typeof value === "string" && value.trim() !== "") || typeof value === "number") {
    return <p className="whitespace-pre-wrap text-sm">{value}</p>
  }
  const document = isFreeTextDocument(value) ? value : null
  const serialized = document === null ? "" : JSON.stringify(document)
  const empty = document === null || (freeTextPlain(document).trim() === "" && !serialized.includes('"table"') && !serialized.includes('"documentBlock"'))
  if (empty) return <p className="text-sm text-muted-foreground">{emptyText}</p>

  return <div className="free-text-content text-sm">{renderFreeText(document)}</div>
}
