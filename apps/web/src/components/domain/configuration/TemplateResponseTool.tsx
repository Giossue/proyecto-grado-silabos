"use client"

import type { Editor } from "@tiptap/core"
import { ChevronDown, ListChecks, RotateCcw } from "lucide-react"
import { useEffect, useId, useState } from "react"
import { Controller, useWatch } from "react-hook-form"
import type { z } from "zod"
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
  FREE_TEXT_KIND,
  RESPONSE_DISPLAYS,
  RESPONSE_HELP_LENGTH,
  RESPONSE_NODE,
  RESPONSE_TEXT_LENGTH,
  emptyResponse,
  keptAnswer,
  responseAttrs,
  responseHasOptions,
  responseKindOptions,
  responseSettingNames,
  responseSettings,
  sameResponseOptions,
  type ResponseAttrs,
  type ResponseDisplay,
  type ResponseOption,
} from "@silabos/shared/lib/responseKinds"
import type { DocumentNode } from "@silabos/shared/lib/templateDocument"
import { responseToolSchema, type ResponseToolValuesInput } from "@silabos/shared/schemas/template"

type TemplateResponseToolProps = {
  editor?: Editor | null
  allowed?: boolean
  disabled?: boolean
  label?: string
  hint?: string
  optionsHint?: string
  current?: ResponseAttrs | null
  fixed?: boolean
  /** Only Administración: «Más opciones» and «Insertar». Without it, every change is written at once. */
  advanced?: boolean
  fixedReason?: string
  templateOptions?: ResponseOption[] | null
  sources?: ConditionSource[] | null
  usedIds?: string[]
  claimSource?: ((source: ConditionSource) => string | null) | null
  onInsert?: (node: DocumentNode) => void
  /** Live and without an editor: the marked type was unmarked. */
  onRemove?: () => void
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
  current = null,
  fixed = false,
  advanced = true,
  fixedReason = "El tipo lo fija Administración: aquí solo cambia las opciones",
  templateOptions = null,
  sources = null,
  usedIds = NO_IDS,
  claimSource = null,
  onInsert,
  onRemove,
}: TemplateResponseToolProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [more, setMore] = useState(false)
  const [editing, setEditing] = useState(false)
  const [logicId, setLogicId] = useState<string | undefined>(undefined)
  const [placedAt, setPlacedAt] = useState<number | null>(null)
  const [openedAnswer, setOpenedAnswer] = useState<unknown>(null)
  const live = !advanced
  const [allSources, setAllSources] = useState<ConditionSource[]>([])

  const showsCondition = sources !== null && !fixed
  const schema = responseToolSchema({ fixed, conditional: showsCondition, current })
  const form = useSchemaForm(schema, {
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
  const optionsError = fieldMessage(errors, "options") ?? ""

  useEffect(() => {
    void form.trigger()
  }, [form, values, fixed, current, showsCondition])

  const standalone = editor === undefined
  // Live, a field closed by «Texto libre» takes no typing, but its type can still be changed here.
  const ready = !disabled && allowed && (standalone || (editor !== null && editor !== undefined && !editor.isDestroyed && (live || editor.isEditable)))
  const tooltip = allowed ? label : `${label}: no va en campos No editables`
  const settingNames = responseSettingNames(kind)
  const resettable = fixed && templateOptions !== null && !sameResponseOptions(options, templateOptions)

  const selected = (): ResponseAttrs | null => {
    const node = (editor?.state.selection as { node?: { type: { name: string }; attrs: Record<string, unknown> } } | undefined)?.node
    return node?.type.name === RESPONSE_NODE ? responseAttrs({ type: RESPONSE_NODE, attrs: node.attrs as never }) : null
  }
  const anchor = (): number => (editor?.state.selection as { from: number } | undefined)?.from ?? 0
  /** Live, the field holds a single space: the selected one or the only one, wherever the cursor is. */
  const fieldSpace = (): { at: number; attrs: ResponseAttrs } | null => {
    if (!live || !editor || editor.isDestroyed) return null
    let at = selected() ? anchor() : -1
    if (at < 0) {
      editor.state.doc.descendants((node, position) => {
        if (at < 0 && node.type.name === RESPONSE_NODE) at = position
      })
    }
    const node = at < 0 ? null : editor.state.doc.nodeAt(at)
    return node ? { at, attrs: responseAttrs({ type: RESPONSE_NODE, attrs: node.attrs as never }) } : null
  }
  const ownSources = (): ConditionSource[] => {
    if (!editor || editor.isDestroyed) return []
    let before = 0
    editor.state.doc.nodesBetween(0, Math.min(anchor(), editor.state.doc.content.size), (node, position) => {
      if (node.type.name === RESPONSE_NODE && position < anchor()) before += 1
    })
    return conditionSources([{ id: "campo", label: "Este campo", content: editor.getJSON() as DocumentNode }]).filter((source) => source.index < before)
  }

  useOpened(open, () => {
    const space = current ? null : fieldSpace()
    const attrs = current ?? space?.attrs ?? selected()
    const found = sources === null ? [] : [...sources, ...ownSources()]
    const condition = choiceOf(attrs?.showIf, found)
    setEditing(attrs !== null)
    // Live: a new space starts with no type chosen, because choosing one is what places it.
    form.reset(attrs ? fromAttrs({ ...attrs, kind: attrs.kind || form.getValues("kind") }, condition) : { ...fresh(live ? "" : form.getValues("kind")), condition })
    setPlacedAt(space?.at ?? null)
    setOpenedAnswer(attrs?.value ?? null)
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

  const nodeFor = ({ kind: chosenKind, options: chosen, settings, condition }: z.output<typeof schema>): DocumentNode => {
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
    return emptyResponse(chosenKind, chosen, fixed && current ? responseSettings(chosenKind, current) : settings, logic)
  }

  const insert = form.handleSubmit((parsed) => {
    if (!ready) return
    const node = nodeFor(parsed)
    if (standalone) onInsert?.(node)
    else editor!.chain().focus().insertContent(node).run()
    form.reset({ ...fresh(parsed.kind), condition: parsed.condition })
    setOpen(false)
  })

  // Without focusing the editor, which would close the popover; later changes rewrite the same node.
  const writeInPlace = (node: DocumentNode): void => {
    if (standalone) {
      onInsert?.(node)
      return
    }
    const target = editor!
    // «Texto libre» leaves the whole field to the teacher: what was written goes.
    if (responseAttrs(node).kind === FREE_TEXT_KIND) {
      target.commands.setContent({ type: "doc", content: [{ type: "paragraph", content: [node] }] })
      return
    }
    if (placedSpace() !== null) {
      target.view.dispatch(target.state.tr.setNodeMarkup(placedAt!, undefined, node.attrs))
      return
    }
    target.commands.insertContent(node)
    setPlacedAt(target.state.selection.from - 1)
  }

  const placedSpace = (): number | null => (placedAt !== null && editor?.state.doc.nodeAt(placedAt)?.type.name === RESPONSE_NODE ? placedAt : null)

  /** Unmarking the type removes the space; the text around it stays. */
  const clear = (): void => {
    if (standalone) {
      if (ready) onRemove?.()
      return
    }
    const at = placedSpace()
    if (ready && at !== null) editor!.view.dispatch(editor!.state.tr.delete(at, at + 1))
    setPlacedAt(null)
  }

  /** Writes the space as it is now. A template response stays as it was while the change is not valid. */
  const apply = (chosenKind: string, chosen: ResponseOption[]): void => {
    const parsed = schema.safeParse({ ...form.getValues(), kind: chosenKind, options: chosen })
    if (!ready || !parsed.success) return
    const node = nodeFor(parsed.data)
    // The answer is kept from the one held on opening: an option being retyped does not lose it.
    if (fixed) node.attrs = { ...node.attrs, value: keptAnswer(openedAnswer, chosen) as never }
    writeInPlace(node)
    // Close when nothing is left to write here.
    if (!fixed && !responseHasOptions(chosenKind)) setOpen(false)
  }

  const reset = (): void => {
    if (!templateOptions) return
    const restored = templateOptions.map((option) => ({ ...option }))
    form.setValue("options", restored)
    apply(kind, restored)
    setOpen(false)
  }

  return (
    <MenuTooltip label={tooltip}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={label} disabled={!ready} onMouseDown={(event) => event.preventDefault()}>
            <ListChecks aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="max-h-(--overlay-max-height) w-96 overflow-y-auto">
          <form noValidate onSubmit={(event) => (live ? event.preventDefault() : void insert(event))}>
            <FieldGroup>
              <Field>
                <FieldLabel>Tipo de respuesta</FieldLabel>
                <Controller
                  control={form.control}
                  name="kind"
                  render={({ field }) => (
                    <ChoiceGroup
                      value={field.value}
                      label="Tipo de respuesta"
                      options={KINDS}
                      disabled={fixed}
                      clearable={live}
                      onValueChange={(next) => {
                        field.onChange(next)
                        if (!live) return
                        if (next === "") clear()
                        else apply(next, options)
                      }}
                    />
                  )}
                />
                {fixed ? <FieldDescription data-response-fixed>{fixedReason}</FieldDescription> : hint ? <FieldDescription>{hint}</FieldDescription> : null}
              </Field>
              {responseHasOptions(kind) ? (
                <Field>
                  <FieldLabel>Opciones</FieldLabel>
                  <Controller
                    control={form.control}
                    name="options"
                    render={({ field }) => (
                      <ResponseOptionsEditor
                        value={field.value}
                        onValueChange={(next) => {
                          field.onChange(next)
                          if (live) apply(kind, next)
                        }}
                      />
                    )}
                  />
                  {live && optionsError ? <FieldError data-response-options-error>{optionsError}</FieldError> : null}
                  {!fixed ? <FieldDescription>{optionsHint}</FieldDescription> : null}
                </Field>
              ) : null}
              {advanced ? (
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
              ) : null}
              {showsCondition && more ? (
                <Controller
                  control={form.control}
                  name="condition"
                  render={({ field }) => <TemplateConditionPicker value={field.value} sources={allSources} hint="Si queda oculta, se oculta toda su línea" onValueChange={field.onChange} />}
                />
              ) : null}
              {settingsError ? <FieldError data-response-settings-error>{settingsError}</FieldError> : null}
              {conditionError ? <FieldError data-response-condition-error>{conditionError}</FieldError> : null}
              {live && !resettable ? null : (
                <div className="flex flex-wrap gap-2">
                  {live ? null : (
                    <Button type="submit" size="sm" className="w-fit" disabled={Boolean(optionsError || settingsError || conditionError)} data-response-insert>
                      {editing ? "Guardar cambios" : "Insertar"}
                    </Button>
                  )}
                  {resettable ? (
                    <Button type="button" variant="outline" size="sm" className="w-fit" data-response-reset onClick={reset}>
                      <RotateCcw data-icon="inline-start" aria-hidden="true" />
                      Restablecer opciones de la plantilla
                    </Button>
                  ) : null}
                </div>
              )}
            </FieldGroup>
          </form>
        </PopoverContent>
      </Popover>
    </MenuTooltip>
  )
}
