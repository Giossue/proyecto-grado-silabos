"use client"

import type { Editor } from "@tiptap/core"
import { ChevronDown, ListChecks, RotateCcw } from "lucide-react"
import { useEffect, useId, useState } from "react"
import { Controller, useWatch } from "react-hook-form"
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
import { fieldMessage, useSchemaForm } from "@/lib/forms"
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
} from "@/lib/responseKinds"
import type { DocumentNode } from "@/lib/templateDocument"
import { responseToolSchema, type ResponseToolValuesInput } from "@/schemas/template"

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

const NO_CONDITION: ConditionChoice = { source: "", options: [] }

const fresh = (kind: string): ResponseToolValuesInput => ({
  kind,
  options: [],
  required: true,
  help: "",
  maxLength: "",
  minChoices: "",
  maxChoices: "",
  display: "lista",
  condition: NO_CONDITION,
})

const fromAttrs = (attrs: ResponseAttrs, condition: ConditionChoice): ResponseToolValuesInput => ({
  kind: attrs.kind,
  options: attrs.options ?? [],
  required: attrs.required !== false,
  help: attrs.help ?? "",
  maxLength: attrs.maxLength ? String(attrs.maxLength) : "",
  minChoices: attrs.minChoices ? String(attrs.minChoices) : "",
  maxChoices: attrs.maxChoices ? String(attrs.maxChoices) : "",
  display: attrs.display ?? "lista",
  condition,
})

const KINDS = responseKindOptions.map((item) => ({ value: item.kind, label: item.label }))
const DISPLAYS = RESPONSE_DISPLAYS.map((item) => ({ value: item.value, label: item.label }))
const NO_IDS: string[] = []


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
  const [editing, setEditing] = useState(false)
  const [logicId, setLogicId] = useState<string | undefined>(undefined)
  const [allSources, setAllSources] = useState<ConditionSource[]>([])

  const showsCondition = sources !== null && !fixed
  const form = useSchemaForm(responseToolSchema({ fixed, requireOptions, conditional: showsCondition, current }), {
    defaultValues: fresh(responseKindOptions[0]!.kind),
    mode: "onChange",
    reValidateMode: "onChange",
    keepPeriods: true,
  })
  const values = useWatch({ control: form.control })
  const kind = values.kind ?? responseKindOptions[0]!.kind
  const options = (values.options ?? []) as ResponseOption[]
  const errors = form.formState.errors
  const settingsError = fieldMessage(errors, "settings") ?? ""
  const conditionError = fieldMessage(errors, "condition") ?? ""
  const missingOptions = Boolean(fieldMessage(errors, "options"))

  useEffect(() => {
    void form.trigger()
  }, [form, values, fixed, requireOptions, current, showsCondition])

  const standalone = editor === undefined
  const ready = !disabled && allowed && (standalone || (editor !== null && editor !== undefined && !editor.isDestroyed && editor.isEditable))
  const tooltip = allowed ? label : `${label}: no va en campos Institucionales`
  const settingNames = responseSettingNames(kind)
  const resettable = fixed && templateOptions !== null && !sameResponseOptions(options, templateOptions)

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
    const condition = choiceOf(attrs?.showIf, found)
    setEditing(attrs !== null)
    form.reset(attrs ? fromAttrs({ ...attrs, kind: attrs.kind || form.getValues("kind") }, condition) : { ...fresh(form.getValues("kind")), condition })
    setLogicId(attrs?.id)
    setAllSources(found)
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

  const insert = form.handleSubmit(({ kind: chosenKind, options: chosen, settings, condition }) => {
    if (!ready) return
    const logic: { id?: string; showIf?: { response: string; options: string[] } } = {}
    if (fixed && current) {
      if (current.id) logic.id = current.id
      if (current.showIf) logic.showIf = current.showIf
    } else if (showsCondition) {
      const used = [...usedIds, ...responseIds([editor?.getJSON() as DocumentNode])].filter((item) => item !== logicId)
      if (responseHasOptions(chosenKind)) logic.id = logicId ?? newResponseId(used)
      const source = allSources.find((item) => conditionSourceKey(item) === condition.source)
      const response = source ? claim(source) : null
      if (source && response) logic.showIf = { response, options: condition.options }
    } else {
      if (logicId) logic.id = logicId
      const showIf = current?.showIf ?? selected()?.showIf
      if (showIf) logic.showIf = showIf
    }
    const node = emptyResponse(chosenKind, chosen, fixed && current ? responseSettings(chosenKind, current) : settings, logic)
    if (standalone) onInsert?.(node)
    else editor!.chain().focus().insertContent(node).run()
    form.reset({ ...fresh(chosenKind), condition })
    setOpen(false)
  })
  const reset = (): void => {
    if (!templateOptions) return
    form.setValue("options", templateOptions.map((option) => ({ ...option })))
    void insert()
  }

  return (
    <MenuTooltip label={tooltip}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={label} disabled={!ready} onMouseDown={(event) => event.preventDefault()}>
            <ListChecks aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="max-h-(--overlay-max-height) w-80 overflow-y-auto">
          <form noValidate onSubmit={(event) => void insert(event)}>
            <FieldGroup>
              <Field>
                <FieldLabel>Tipo de respuesta</FieldLabel>
                <Controller
                  control={form.control}
                  name="kind"
                  render={({ field }) => <ChoiceGroup value={field.value} label="Tipo de respuesta" options={KINDS} disabled={fixed} onValueChange={field.onChange} />}
                />
                {fixed ? <FieldDescription data-response-fixed>{fixedReason}</FieldDescription> : <FieldDescription>{hint}</FieldDescription>}
              </Field>
              {responseHasOptions(kind) ? (
                <Field>
                  <FieldLabel>Opciones</FieldLabel>
                  <Controller control={form.control} name="options" render={({ field }) => <ResponseOptionsEditor value={field.value} onValueChange={field.onChange} />} />
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
                      <Controller
                        control={form.control}
                        name="required"
                        render={({ field }) => <Switch id={`${id}-required`} checked={field.value} disabled={fixed} data-response-required onCheckedChange={field.onChange} />}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`${id}-help`}>Ayuda</FieldLabel>
                      <Input
                        id={`${id}-help`}
                        {...form.register("help")}
                        maxLength={RESPONSE_HELP_LENGTH}
                        autoComplete="off"
                        placeholder="Se muestra debajo de la respuesta"
                        disabled={fixed}
                        data-response-help
                      />
                    </Field>
                    {settingNames.includes("maxLength") ? (
                      <Field>
                        <FieldLabel htmlFor={`${id}-max-length`}>Caracteres máximos</FieldLabel>
                        <Input
                          id={`${id}-max-length`}
                          {...form.register("maxLength")}
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder={String(RESPONSE_TEXT_LENGTH)}
                          disabled={fixed}
                          data-response-max-length
                        />
                      </Field>
                    ) : null}
                    {settingNames.includes("display") ? (
                      <Field>
                        <FieldLabel>Cómo se muestra</FieldLabel>
                        <Controller
                          control={form.control}
                          name="display"
                          render={({ field }) => <ChoiceGroup value={field.value} label="Cómo se muestra" options={DISPLAYS} disabled={fixed} onValueChange={(value) => field.onChange(value as ResponseDisplay)} />}
                        />
                      </Field>
                    ) : null}
                    {settingNames.includes("minChoices") ? (
                      <div className="grid grid-cols-2 gap-2">
                        <Field>
                          <FieldLabel htmlFor={`${id}-min`}>Elegir al menos</FieldLabel>
                          <Input
                            id={`${id}-min`}
                            {...form.register("minChoices")}
                            inputMode="numeric"
                            autoComplete="off"
                            placeholder="1"
                            disabled={fixed}
                            data-response-min
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`${id}-max`}>Como máximo</FieldLabel>
                          <Input
                            id={`${id}-max`}
                            {...form.register("maxChoices")}
                            inputMode="numeric"
                            autoComplete="off"
                            placeholder="Todas"
                            disabled={fixed}
                            data-response-max
                          />
                        </Field>
                      </div>
                    ) : null}
                  </FieldGroup>
                </CollapsibleContent>
              </Collapsible>
              {showsCondition && more ? (
                <Controller
                  control={form.control}
                  name="condition"
                  render={({ field }) => <TemplateConditionPicker value={field.value} sources={allSources} hint="Si queda oculta, se oculta toda su línea" onValueChange={field.onChange} />}
                />
              ) : null}
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
