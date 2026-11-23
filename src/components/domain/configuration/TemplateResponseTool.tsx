"use client"

import type { Editor } from "@tiptap/core"
import { ChevronDown, ListChecks, RotateCcw } from "lucide-react"
import { useId, useState, type FormEvent } from "react"
import { ChoiceGroup } from "@/components/domain/ChoiceGroup"
import { MenuTooltip } from "@/components/domain/MenuTooltip"
import { ResponseOptionsEditor } from "@/components/domain/syllabus/ResponseOptionsEditor"
import { TemplateConditionPicker } from "@/components/domain/syllabus/TemplateConditionPicker"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { useOpened } from "@/composables/useModelOpen"
import { choiceOf, conditionSourceKey, conditionSources, newResponseId, responseIds, type ConditionChoice, type ConditionSource } from "@/lib/responseConditions"
import {
  RESPONSE_DISPLAYS,
  RESPONSE_HELP_LENGTH,
  RESPONSE_NODE,
  RESPONSE_TEXT_LENGTH,
  emptyResponse,
  responseAttrs,
  responseHasOptions,
  responseKindOptions,
  responseSettingNames,
  responseSettings,
  sameResponseOptions,
  type ResponseAttrs,
  type ResponseDisplay,
  type ResponseOption,
  type ResponseSettings,
} from "@/lib/responseKinds"
import type { DocumentNode } from "@/lib/templateDocument"

type TemplateResponseToolProps = {
  editor?: Editor | null
  allowed?: boolean
  disabled?: boolean
  label?: string
  hint?: string
  optionsHint?: string
  requireOptions?: boolean
  current?: ResponseAttrs | null
  fixed?: boolean
  fixedReason?: string
  templateOptions?: ResponseOption[] | null
  sources?: ConditionSource[] | null
  usedIds?: string[]
  claimSource?: ((source: ConditionSource) => string | null) | null
  onInsert?: (node: DocumentNode) => void
}

type Draft = { required: boolean; help: string; maxLength: string; minChoices: string; maxChoices: string; display: ResponseDisplay }

const fresh = (): Draft => ({ required: true, help: "", maxLength: "", minChoices: "", maxChoices: "", display: "lista" })

const fromSettings = (settings: ResponseSettings): Draft => ({
  required: settings.required !== false,
  help: settings.help ?? "",
  maxLength: settings.maxLength ? String(settings.maxLength) : "",
  minChoices: settings.minChoices ? String(settings.minChoices) : "",
  maxChoices: settings.maxChoices ? String(settings.maxChoices) : "",
  display: settings.display ?? "lista",
})

const KINDS = responseKindOptions.map((item) => ({ value: item.kind, label: item.label }))
const DISPLAYS = RESPONSE_DISPLAYS.map((item) => ({ value: item.value, label: item.label }))
const NO_IDS: string[] = []

const plural = (count: number): string => (count === 1 ? "1 opción" : `${count} opciones`)
const whole = (text: string): number | null => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : null)
const inRange = (text: string, max: number): boolean => text.trim() === "" || ((whole(text) ?? 0) >= 1 && (whole(text) ?? 0) <= max)

export function TemplateResponseTool({
  editor,
  allowed = true,
  disabled = false,
  label = "Tipo de respuesta",
  hint = "Quien llena el campo solo responde: no cambia el tipo ni las opciones",
  optionsHint = "Si las deja vacías, Coordinación las escribe en cada materia",
  requireOptions = false,
  current = null,
  fixed = false,
  fixedReason = "El tipo y Más opciones los fija Administración: aquí solo cambia las opciones",
  templateOptions = null,
  sources = null,
  usedIds = NO_IDS,
  claimSource = null,
  onInsert,
}: TemplateResponseToolProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [more, setMore] = useState(false)
  const [kind, setKind] = useState(responseKindOptions[0]!.kind)
  const [options, setOptions] = useState<ResponseOption[]>([])
  const [draft, setDraft] = useState<Draft>(fresh)
  const [editing, setEditing] = useState(false)
  const [logicId, setLogicId] = useState<string | undefined>(undefined)
  const [condition, setCondition] = useState<ConditionChoice>({ source: "", options: [] })
  const [allSources, setAllSources] = useState<ConditionSource[]>([])

  const standalone = editor === undefined
  const ready = !disabled && allowed && (standalone || (editor !== null && editor !== undefined && !editor.isDestroyed && editor.isEditable))
  const tooltip = allowed ? label : `${label}: no va en campos Institucionales`
  const settingNames = responseSettingNames(kind)
  const missingFor = (list: ResponseOption[]): boolean => (requireOptions || fixed) && responseHasOptions(kind) && list.length === 0
  const missingOptions = missingFor(options)
  const resettable = fixed && templateOptions !== null && !sameResponseOptions(options, templateOptions)
  const settings: ResponseSettings = {
    required: draft.required,
    help: draft.help,
    maxLength: whole(draft.maxLength) ?? undefined,
    minChoices: whole(draft.minChoices) ?? undefined,
    maxChoices: whole(draft.maxChoices) ?? undefined,
    display: draft.display,
  }
  const settingsErrorFor = (list: ResponseOption[]): string => {
    if (fixed) {
      const min = current?.minChoices
      const max = current?.maxChoices
      if (min && min > list.length) return `Esta respuesta pide elegir al menos ${min}: deje al menos ${plural(min)}.`
      if (max && max > list.length) return `Esta respuesta permite elegir hasta ${max}: deje al menos ${plural(max)}.`
      return ""
    }
    if (settingNames.includes("maxLength") && !inRange(draft.maxLength, RESPONSE_TEXT_LENGTH)) return `El límite de caracteres va de 1 a ${RESPONSE_TEXT_LENGTH}.`
    if (settingNames.includes("minChoices") && (draft.minChoices.trim() || draft.maxChoices.trim())) {
      if (list.length === 0) return "Escriba las opciones antes de fijar cuántas elegir."
      if (!inRange(draft.minChoices, list.length) || !inRange(draft.maxChoices, list.length)) return `Cuántas elegir va de 1 a ${list.length}, el número de opciones.`
      const min = whole(draft.minChoices)
      const max = whole(draft.maxChoices)
      if (min !== null && max !== null && min > max) return "El mínimo para elegir no puede superar el máximo."
    }
    return ""
  }
  const settingsError = settingsErrorFor(options)
  const showsCondition = sources !== null && !fixed
  const conditionError = showsCondition && condition.source && condition.options.length === 0 ? "Elija al menos una opción para «Mostrar solo si»" : ""

  const selected = (): ResponseAttrs | null => {
    const node = (editor?.state.selection as { node?: { type: { name: string }; attrs: Record<string, unknown> } } | undefined)?.node
    return node?.type.name === RESPONSE_NODE ? responseAttrs({ type: RESPONSE_NODE, attrs: node.attrs as never }) : null
  }
  const anchor = (): number => (editor?.state.selection as { from: number } | undefined)?.from ?? 0
  const ownSources = (): ConditionSource[] => {
    if (!editor || editor.isDestroyed) return []
    let before = 0
    editor.state.doc.nodesBetween(0, Math.min(anchor(), editor.state.doc.content.size), (node, position) => {
      if (node.type.name === RESPONSE_NODE && position < anchor()) before += 1
    })
    return conditionSources([{ id: "campo", label: "Este campo", content: editor.getJSON() as DocumentNode }]).filter((source) => source.index < before)
  }

  useOpened(open, () => {
    const attrs = current ?? selected()
    const found = sources === null ? [] : [...sources, ...ownSources()]
    setEditing(attrs !== null)
    setKind(attrs?.kind || kind)
    setOptions(attrs?.options ?? [])
    setDraft(attrs ? fromSettings(attrs) : fresh())
    setLogicId(attrs?.id)
    setAllSources(found)
    setCondition(choiceOf(attrs?.showIf, found))
    setMore(Boolean(attrs?.showIf))
  })

  const claim = (source: ConditionSource): string | null => {
    if (source.id) return source.id
    const assigned = newResponseId([...usedIds, ...responseIds([editor?.getJSON() as DocumentNode])])
    if (source.field !== "campo") return claimSource?.(source) ?? null
    const target = editor!
    let index = -1
    let at = -1
    target.state.doc.descendants((node, position) => {
      if (node.type.name !== RESPONSE_NODE) return
      index += 1
      if (index === source.index) at = position
    })
    if (at < 0) return null
    target.view.dispatch(target.state.tr.setNodeMarkup(at, undefined, { ...target.state.doc.nodeAt(at)!.attrs, id: assigned }))
    return assigned
  }

  const insert = (chosen: ResponseOption[] = options): void => {
    if (!ready || missingFor(chosen) || settingsErrorFor(chosen) || conditionError) return
    const logic: { id?: string; showIf?: { response: string; options: string[] } } = {}
    if (fixed && current) {
      if (current.id) logic.id = current.id
      if (current.showIf) logic.showIf = current.showIf
    } else if (showsCondition) {
      const used = [...usedIds, ...responseIds([editor?.getJSON() as DocumentNode])].filter((item) => item !== logicId)
      if (responseHasOptions(kind)) logic.id = logicId ?? newResponseId(used)
      const source = allSources.find((item) => conditionSourceKey(item) === condition.source)
      const response = source ? claim(source) : null
      if (source && response) logic.showIf = { response, options: condition.options }
    } else {
      if (logicId) logic.id = logicId
      const showIf = current?.showIf ?? selected()?.showIf
      if (showIf) logic.showIf = showIf
    }
    const node = emptyResponse(kind, chosen, fixed && current ? responseSettings(kind, current) : settings, logic)
    if (standalone) onInsert?.(node)
    else editor!.chain().focus().insertContent(node).run()
    setOptions([])
    setDraft(fresh())
    setOpen(false)
  }
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    insert()
  }
  const reset = (): void => {
    if (!templateOptions) return
    const restored = templateOptions.map((option) => ({ ...option }))
    setOptions(restored)
    insert(restored)
  }
  const setDraftValue = <K extends keyof Draft>(name: K, value: Draft[K]): void => setDraft((currentDraft) => ({ ...currentDraft, [name]: value }))

  return (
    <MenuTooltip label={tooltip}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={label} disabled={!ready} onMouseDown={(event) => event.preventDefault()}>
            <ListChecks aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="max-h-(--overlay-max-height) w-80 overflow-y-auto">
          <form noValidate onSubmit={submit}>
            <FieldGroup>
              <Field>
                <FieldLabel>Tipo de respuesta</FieldLabel>
                <ChoiceGroup value={kind} label="Tipo de respuesta" options={KINDS} disabled={fixed} onValueChange={setKind} />
                {fixed ? <FieldDescription data-response-fixed>{fixedReason}</FieldDescription> : <FieldDescription>{hint}</FieldDescription>}
              </Field>
              {responseHasOptions(kind) ? (
                <Field>
                  <FieldLabel>Opciones</FieldLabel>
                  <ResponseOptionsEditor value={options} onValueChange={setOptions} />
                  {!fixed ? <FieldDescription>{optionsHint}</FieldDescription> : null}
                </Field>
              ) : null}
              <Collapsible open={more} onOpenChange={setMore}>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="w-fit" data-response-more>
                    Más opciones
                    <ChevronDown data-icon="inline-end" aria-hidden="true" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <FieldGroup className="pt-3">
                    <Field orientation="horizontal">
                      <FieldLabel htmlFor={`${id}-required`}>Obligatoria</FieldLabel>
                      <Switch id={`${id}-required`} checked={draft.required} disabled={fixed} data-response-required onCheckedChange={(checked) => setDraftValue("required", checked)} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`${id}-help`}>Ayuda</FieldLabel>
                      <Input
                        id={`${id}-help`}
                        value={draft.help}
                        maxLength={RESPONSE_HELP_LENGTH}
                        autoComplete="off"
                        placeholder="Se muestra debajo de la respuesta"
                        disabled={fixed}
                        data-response-help
                        onChange={(event) => setDraftValue("help", event.target.value)}
                      />
                    </Field>
                    {settingNames.includes("maxLength") ? (
                      <Field>
                        <FieldLabel htmlFor={`${id}-max-length`}>Caracteres máximos</FieldLabel>
                        <Input
                          id={`${id}-max-length`}
                          value={draft.maxLength}
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder={String(RESPONSE_TEXT_LENGTH)}
                          disabled={fixed}
                          data-response-max-length
                          onChange={(event) => setDraftValue("maxLength", event.target.value)}
                        />
                      </Field>
                    ) : null}
                    {settingNames.includes("display") ? (
                      <Field>
                        <FieldLabel>Cómo se muestra</FieldLabel>
                        <ChoiceGroup value={draft.display} label="Cómo se muestra" options={DISPLAYS} disabled={fixed} onValueChange={(value) => setDraftValue("display", value as ResponseDisplay)} />
                      </Field>
                    ) : null}
                    {settingNames.includes("minChoices") ? (
                      <div className="grid grid-cols-2 gap-2">
                        <Field>
                          <FieldLabel htmlFor={`${id}-min`}>Elegir al menos</FieldLabel>
                          <Input
                            id={`${id}-min`}
                            value={draft.minChoices}
                            inputMode="numeric"
                            autoComplete="off"
                            placeholder="1"
                            disabled={fixed}
                            data-response-min
                            onChange={(event) => setDraftValue("minChoices", event.target.value)}
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`${id}-max`}>Como máximo</FieldLabel>
                          <Input
                            id={`${id}-max`}
                            value={draft.maxChoices}
                            inputMode="numeric"
                            autoComplete="off"
                            placeholder="Todas"
                            disabled={fixed}
                            data-response-max
                            onChange={(event) => setDraftValue("maxChoices", event.target.value)}
                          />
                        </Field>
                      </div>
                    ) : null}
                  </FieldGroup>
                </CollapsibleContent>
              </Collapsible>
              {showsCondition && more ? <TemplateConditionPicker value={condition} sources={allSources} hint="Si queda oculta, se oculta toda su línea" onValueChange={setCondition} /> : null}
              {settingsError ? <FieldError data-response-settings-error>{settingsError}</FieldError> : null}
              {conditionError ? <FieldError data-response-condition-error>{conditionError}</FieldError> : null}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" size="sm" className="w-fit" disabled={missingOptions || Boolean(settingsError) || Boolean(conditionError)} data-response-insert>
                  {editing ? "Guardar cambios" : "Insertar"}
                </Button>
                {resettable ? (
                  <Button type="button" variant="outline" size="sm" className="w-fit" data-response-reset onClick={reset}>
                    <RotateCcw data-icon="inline-start" aria-hidden="true" />
                    Restablecer opciones de la plantilla
                  </Button>
                ) : null}
              </div>
            </FieldGroup>
          </form>
        </PopoverContent>
      </Popover>
    </MenuTooltip>
  )
}
