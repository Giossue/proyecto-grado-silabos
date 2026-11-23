import type { DocumentField } from "@/types/configuration"

export type PreviewSection = {
  id: string
  title: string
  orientation?: "portrait" | "landscape"
  fields: Array<Pick<DocumentField, "label" | "value" | "document"> & { id: string; key?: string }>
}
