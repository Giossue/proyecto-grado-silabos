import type { TemplateField } from "@/api/template"
import { FreeTextContent } from "@/components/domain/syllabus/FreeTextContent"
import { RESPONSE_NODE, responseAnswered, responseAttrs } from "@silabos/shared/lib/responseKinds"
import type { DocumentNode, TemplateVariable } from "@silabos/shared/lib/templateDocument"
import { editabilityLabel } from "@/types/configuration"

type TemplateFieldContentProps = { field: TemplateField; preview?: boolean; variables?: TemplateVariable[] }

export function TemplateFieldContent({ field, preview = false, variables }: TemplateFieldContentProps) {
  const shown = (node: DocumentNode): DocumentNode[] => {
    if (node.type === RESPONSE_NODE && preview && !responseAnswered(responseAttrs(node))) return []
    if (node.type !== "variable") return [{ ...node, ...(node.content ? { content: node.content.flatMap(shown) } : {}) }]
    if (preview) return []

    return [{ type: "text", text: variables?.find((item) => item.key === node.attrs?.id)?.label || "Dato del sistema" }]
  }
  const content = shown(field.content)[0] ?? field.content

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {field.label.trim() || !preview ? (
        <div data-field-label className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
          {field.label.trim() ? (
            <h4 className="min-w-0 break-words font-bold [overflow-wrap:anywhere]">{field.label}</h4>
          ) : !preview ? (
            <span className="text-xs italic text-muted-foreground">Campo sin nombre</span>
          ) : null}
          {!preview ? (
            <span className="ml-auto max-w-full rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground" data-field-responsible>
              {editabilityLabel(field.quien_llena)}
            </span>
          ) : null}
        </div>
      ) : null}
      <div data-field-body>
        <FreeTextContent value={content} />
      </div>
    </div>
  )
}
