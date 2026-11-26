"use client"

import { TemplateRibbonDivider, TemplateRibbonGroup } from "@/components/domain/configuration/TemplateRibbonGroup"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { DocumentLayout, DocumentLayoutOptions as TemplateLayoutOptions } from "@/lib/documentLayout"

type LayoutControl = { key: keyof DocumentLayout; label: string; options: TemplateLayoutOptions["margins"] }

type TemplateDesignToolsProps = {
  options?: TemplateLayoutOptions | null
  layout: DocumentLayout
  disabled?: boolean
  onLayout: (key: keyof DocumentLayout, value: string) => void
}

const pageControls = (options: TemplateLayoutOptions): LayoutControl[] => [{ key: "margin_cm", label: "Márgenes", options: options.margins }]
const sizeControls = (options: TemplateLayoutOptions): LayoutControl[] => [
  { key: "title_font_size", label: "Tamaño del título", options: options.title_sizes },
  { key: "section_font_size", label: "Tamaño de las secciones", options: options.section_sizes },
  { key: "body_font_size", label: "Tamaño del contenido", options: options.body_sizes },
]

function LayoutSelect({ control, layout, disabled, onLayout }: { control: LayoutControl; layout: DocumentLayout; disabled: boolean; onLayout: TemplateDesignToolsProps["onLayout"] }) {
  const id = `template-layout-${control.key}`
  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor={id} className="text-xs whitespace-nowrap text-muted-foreground">{control.label}</label>
      <Select value={String(layout[control.key])} disabled={disabled} onValueChange={(value) => onLayout(control.key, value)}>
        <SelectTrigger id={id} size="sm" className="min-w-20">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {control.options.map((option) => <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}

export function TemplateDesignTools({ options, layout, disabled = false, onLayout }: TemplateDesignToolsProps) {
  if (!options) return <p className="px-2 py-2 text-sm text-muted-foreground">El diseño del documento es el institucional</p>

  return (
    <div className="flex shrink-0 items-stretch" data-design-tools>
      <TemplateRibbonGroup label="Página">
        {pageControls(options).map((control) => <LayoutSelect key={control.key} control={control} layout={layout} disabled={disabled} onLayout={onLayout} />)}
      </TemplateRibbonGroup>
      <TemplateRibbonDivider />
      <TemplateRibbonGroup label="Tamaños de letra">
        <div className="flex flex-wrap items-center gap-3">
          {sizeControls(options).map((control) => <LayoutSelect key={control.key} control={control} layout={layout} disabled={disabled} onLayout={onLayout} />)}
        </div>
      </TemplateRibbonGroup>
    </div>
  )
}
