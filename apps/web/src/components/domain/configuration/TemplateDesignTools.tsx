"use client"

import { memo, useState, type ComponentType, type ReactNode } from "react"
import { Popover as PopoverPrimitive } from "radix-ui"
import { Ban, Bold, ChevronDown, FileText, Heading, Italic, Palette, Pilcrow, Type } from "lucide-react"
import { TemplateRibbonGroup } from "@/components/domain/configuration/TemplateRibbonGroup"
import { Button } from "@/components/ui/button"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Toggle } from "@/components/ui/toggle"
import { cn } from "@/lib/utils"
import type { DocumentLayout, DocumentStyleDraft, DocumentLayoutOptions as TemplateLayoutOptions } from "@/lib/documentLayout"

type LayoutControl = { key: keyof DocumentLayout; label: string; options: TemplateLayoutOptions["margins"] }
type Choice = { value: string; label: string }
type Colors = DocumentStyleDraft["colors"]
type Heading = DocumentStyleDraft["title"]

type TemplateDesignToolsProps = {
  options?: TemplateLayoutOptions | null
  layout: DocumentLayout
  style?: DocumentStyleDraft | null
  title?: string
  disabled?: boolean
  onLayout: (key: keyof DocumentLayout, value: string) => void
  onStyle?: (style: DocumentStyleDraft, group: string) => void
  onTitle?: (value: string) => void
}

const PAPERS: Choice[] = [
  { value: "letter", label: "Carta" },
  { value: "a4", label: "A4" },
  { value: "legal", label: "Oficio" },
]
const ORIENTATIONS: Choice[] = [
  { value: "portrait", label: "Vertical" },
  { value: "landscape", label: "Horizontal" },
]
const FONTS: Choice[] = ["Arial", "Calibri", "Times New Roman", "Verdana", "Georgia"].map((font) => ({ value: font, label: font }))
const ALIGNMENTS: Choice[] = [
  { value: "left", label: "Izquierda" },
  { value: "center", label: "Centrada" },
  { value: "right", label: "Derecha" },
  { value: "justify", label: "Justificada" },
]
const COLORS: Array<{ key: keyof Colors; label: string; fallback?: string }> = [
  { key: "text", label: "Texto" },
  { key: "title", label: "Título" },
  { key: "table_header_background", label: "Fondo del encabezado", fallback: "#FFFFFF" },
  { key: "table_header_text", label: "Texto del encabezado", fallback: "#000000" },
  { key: "table_border", label: "Borde de tabla" },
  { key: "empty_text", label: "Texto vacío" },
]

const pageControls = (options: TemplateLayoutOptions): LayoutControl[] => [{ key: "margin_cm", label: "Márgenes", options: options.margins }]
const sizeControls = (options: TemplateLayoutOptions): LayoutControl[] => [
  { key: "title_font_size", label: "Tamaño del título", options: options.title_sizes },
  { key: "section_font_size", label: "Tamaño de las secciones", options: options.section_sizes },
  { key: "body_font_size", label: "Tamaño del contenido", options: options.body_sizes },
]

function Labelled({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-2">
      <label htmlFor={id} className="text-sm text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

function DesignMenu({ label, icon: Icon, disabled, children }: { label: string; icon: ComponentType<{ "aria-hidden"?: boolean | "true" }>; disabled: boolean; children: ReactNode }) {
  return (
    <TemplateRibbonGroup label={label} caption={false}>
      <PopoverPrimitive.Root>
        <PopoverPrimitive.Trigger asChild>
          <Button type="button" variant="ghost" size="sm" disabled={disabled} className="h-9 gap-1.5 px-2.5">
            <Icon aria-hidden="true" />
            {label}
            <ChevronDown aria-hidden="true" className="opacity-60" />
          </Button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          aria-label={label}
          className="z-50 w-96 max-w-(--radix-popover-content-available-width) rounded-md bg-popover p-4 text-popover-foreground shadow-menu ring-1 ring-surface-ring outline-hidden"
        >
          <div className="flex flex-col gap-3">{children}</div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Root>
    </TemplateRibbonGroup>
  )
}

function ChoiceSelect({ id, label, value, choices, disabled, onChange }: { id: string; label: string; value: string; choices: Choice[]; disabled: boolean; onChange: (value: string) => void }) {
  return (
    <Labelled id={id} label={label}>
      <Select value={value} disabled={disabled} onValueChange={onChange}>
        <SelectTrigger id={id} size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {choices.map((choice) => <SelectItem key={choice.value} value={choice.value}>{choice.label}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Labelled>
  )
}

function LayoutSelect({ control, layout, disabled, onLayout }: { control: LayoutControl; layout: DocumentLayout; disabled: boolean; onLayout: TemplateDesignToolsProps["onLayout"] }) {
  return (
    <ChoiceSelect
      id={`template-layout-${control.key}`}
      label={control.label}
      value={String(layout[control.key])}
      choices={control.options.map((option) => ({ value: String(option.value), label: option.label }))}
      disabled={disabled}
      onChange={(value) => onLayout(control.key, value)}
    />
  )
}

function NumberInput({ id, label, value, min, max, step, disabled, onChange }: { id: string; label: string; value: number; min: number; max: number; step: number; disabled: boolean; onChange: (value: number) => void }) {
  const [text, setText] = useState<string | null>(null)
  const change = (next: string): void => {
    setText(next)
    const number = Number(next)
    if (next.trim() !== "" && Number.isFinite(number) && number >= min && number <= max) onChange(number)
  }
  return (
    <Labelled id={id} label={label}>
      <Input id={id} type="number" inputMode="decimal" min={min} max={max} step={step} value={text ?? String(value)} disabled={disabled} className="h-8 w-24" onChange={(event) => change(event.target.value)} onBlur={() => setText(null)} />
    </Labelled>
  )
}

function TextInput({ id, label, value, maxLength, disabled, onChange }: { id: string; label: string; value: string; maxLength: number; disabled: boolean; onChange: (value: string) => void }) {
  return (
    <Labelled id={id} label={label}>
      <Input id={id} value={value} maxLength={maxLength} disabled={disabled} className="h-8 w-full" onChange={(event) => onChange(event.target.value)} />
    </Labelled>
  )
}

function ColorInput({ id, label, value, fallback, disabled, onChange }: { id: string; label: string; value: string | null; fallback?: string; disabled: boolean; onChange: (value: string | null) => void }) {
  const empty = value === null
  return (
    <div className="grid grid-cols-[8.5rem_auto_auto] items-center justify-start gap-2">
      <label htmlFor={id} className="text-sm text-muted-foreground">{label}</label>
      <input
        id={id}
        type="color"
        value={(value ?? fallback ?? "#000000").toLowerCase()}
        disabled={disabled}
        className={cn("h-7 w-8 cursor-pointer rounded-md border border-border bg-field p-0.5 shadow-control disabled:cursor-not-allowed disabled:opacity-50", empty && "opacity-40")}
        onChange={(event) => onChange(event.target.value)}
      />
      {fallback ? (
        <IconTooltip label={`Sin color: ${label}`}>
          <Toggle size="sm" variant="outline" aria-label={`Sin color: ${label}`} pressed={empty} disabled={disabled} className="h-7 min-w-7 px-1" onPressedChange={(pressed) => onChange(pressed ? null : fallback)}>
            <Ban aria-hidden="true" />
          </Toggle>
        </IconTooltip>
      ) : null}
    </div>
  )
}

function HeadingControls({ name, prefix, heading, disabled, onChange }: { name: string; prefix: string; heading: Pick<Heading, "bold" | "italic" | "alignment">; disabled: boolean; onChange: (heading: Pick<Heading, "bold" | "italic" | "alignment">) => void }) {
  const id = `template-style-${prefix}-alignment`
  return (
    <div className="flex items-center gap-1">
      <IconTooltip label={`Negrita ${name}`}>
        <Toggle size="sm" aria-label={`Negrita ${name}`} pressed={heading.bold} disabled={disabled} onPressedChange={(bold) => onChange({ ...heading, bold })}>
          <Bold aria-hidden="true" />
        </Toggle>
      </IconTooltip>
      <IconTooltip label={`Cursiva ${name}`}>
        <Toggle size="sm" aria-label={`Cursiva ${name}`} pressed={heading.italic} disabled={disabled} onPressedChange={(italic) => onChange({ ...heading, italic })}>
          <Italic aria-hidden="true" />
        </Toggle>
      </IconTooltip>
      <label htmlFor={id} className="sr-only">Alineación {name}</label>
      <Select value={heading.alignment} disabled={disabled} onValueChange={(alignment) => onChange({ ...heading, alignment })}>
        <SelectTrigger id={id} size="sm" className="ml-1 w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {ALIGNMENTS.map((choice) => <SelectItem key={choice.value} value={choice.value}>{choice.label}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}

export const TemplateDesignTools = memo(function TemplateDesignTools({ options, layout, style = null, title = "", disabled = false, onLayout, onStyle, onTitle }: TemplateDesignToolsProps) {
  if (!options) return <p className="px-2 py-2 text-sm text-muted-foreground">El diseño del documento es el institucional</p>

  const change = <K extends keyof DocumentStyleDraft>(key: K, value: DocumentStyleDraft[K]): void => {
    if (style) onStyle?.({ ...style, [key]: value }, `design-${key}`)
  }
  const sizes = sizeControls(options).map((control) => <LayoutSelect key={control.key} control={control} layout={layout} disabled={disabled} onLayout={onLayout} />)

  return (
    <div className="flex shrink-0 items-center gap-1" data-design-tools>
      <DesignMenu label="Página" icon={FileText} disabled={disabled}>
        {style ? <ChoiceSelect id="template-style-paper" label="Papel" value={style.paper} choices={PAPERS} disabled={disabled} onChange={(value) => change("paper", value as DocumentStyleDraft["paper"])} /> : null}
        {style ? <ChoiceSelect id="template-style-orientation" label="Orientación" value={style.orientation} choices={ORIENTATIONS} disabled={disabled} onChange={(value) => change("orientation", value as DocumentStyleDraft["orientation"])} /> : null}
        {pageControls(options).map((control) => <LayoutSelect key={control.key} control={control} layout={layout} disabled={disabled} onLayout={onLayout} />)}
      </DesignMenu>
      <DesignMenu label="Fuente" icon={Type} disabled={disabled}>
        {style ? <ChoiceSelect id="template-style-font_family" label="Letra" value={style.font_family} choices={FONTS} disabled={disabled} onChange={(value) => change("font_family", value)} /> : null}
        {sizes}
      </DesignMenu>
      {style ? (
        <>
          <DesignMenu label="Párrafo" icon={Pilcrow} disabled={disabled}>
            <NumberInput id="template-style-line_height" label="Interlineado" value={style.line_height} min={1} max={3} step={0.05} disabled={disabled} onChange={(value) => change("line_height", value)} />
            <NumberInput id="template-style-paragraph_spacing_pt" label="Espacio entre párrafos (pt)" value={style.paragraph_spacing_pt} min={0} max={36} step={1} disabled={disabled} onChange={(value) => change("paragraph_spacing_pt", value)} />
            <ChoiceSelect id="template-style-body-alignment" label="Alineación del texto" value={style.body.alignment} choices={ALIGNMENTS} disabled={disabled} onChange={(alignment) => change("body", { alignment })} />
            <TextInput id="template-style-empty_text" label="Texto vacío" value={style.empty_text} maxLength={120} disabled={disabled} onChange={(value) => change("empty_text", value)} />
          </DesignMenu>
          <DesignMenu label="Colores" icon={Palette} disabled={disabled}>
            {COLORS.map((color) => (
              <ColorInput
                key={color.key}
                id={`template-style-colors-${color.key}`}
                label={color.label}
                value={style.colors[color.key]}
                fallback={color.fallback}
                disabled={disabled}
                onChange={(value) => change("colors", { ...style.colors, [color.key]: value === null ? null : value.toUpperCase() })}
              />
            ))}
          </DesignMenu>
          <DesignMenu label="Títulos" icon={Heading} disabled={disabled}>
            <TextInput id="template-style-title-text" label="Título" value={title} maxLength={180} disabled={disabled} onChange={(value) => onTitle?.(value)} />
            <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-2">
              <span className="text-sm text-muted-foreground">Formato del título</span>
              <HeadingControls name="del título" prefix="title" heading={style.title} disabled={disabled} onChange={(heading) => change("title", heading)} />
            </div>
            <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-2">
              <span className="text-sm text-muted-foreground">Títulos de sección</span>
              <HeadingControls name="de los títulos de sección" prefix="section_title" heading={style.section_title} disabled={disabled} onChange={(heading) => change("section_title", heading)} />
            </div>
          </DesignMenu>
        </>
      ) : null}
    </div>
  )
})
