import { FreeTextContent } from "@/components/domain/syllabus/FreeTextContent"
import { Badge } from "@/components/ui/badge"
import { editabilityLabel, type DocumentField } from "@/types/configuration"

type FieldViewProps = { field: DocumentField; badge?: string; bare?: boolean; id?: string }

export function FieldView({ field, badge, bare = false, id }: FieldViewProps) {
  return (
    <div id={id} className="syllabus-readonly-field flex flex-col gap-2 rounded-md bg-muted/30 p-4 ring-1 ring-surface-ring">
      {!bare ? (
        <div className="flex flex-wrap items-center gap-2 font-medium">
          {field.label.trim() ? <span>{field.label}</span> : null}
          <Badge variant="outline">{badge ?? editabilityLabel(field.quien_llena)}</Badge>
        </div>
      ) : null}
      <FreeTextContent value={field.document ?? field.value} />
    </div>
  )
}
