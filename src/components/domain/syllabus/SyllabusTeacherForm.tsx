"use client"

import { ArrowLeft, ArrowRight } from "lucide-react"
import { useState } from "react"
import { flushSync } from "react-dom"
import type { SyllabusDetail, SyllabusField } from "@/api/syllabi"
import { FieldResponseEditor } from "@/components/domain/syllabus/FieldResponseEditor"
import { FieldView } from "@/components/domain/syllabus/FieldView"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { counterLabel, fieldCharacters } from "@/lib/fieldLimits"
import { responseDocument } from "@/lib/fieldResponses"
import { syllabusConditions } from "@/lib/responseConditions"
import { fieldTitle, isTeacherField } from "@/lib/syllabusForm"
import type { DocumentNode } from "@/lib/templateDocument"
import { cn } from "@/lib/utils"
import { responsibleLabel } from "@/types/configuration"

type Section = SyllabusDetail["sections"][number]

export type SyllabusTeacherFormProps = {
  sections: Section[]
  disabled?: boolean
  errors?: (fieldId: string) => string[]
  onValueChange?: (field: SyllabusField, value: DocumentNode) => void
  active?: string
  onActiveChange?: (id: string) => void
  collapsed?: Set<string>
  onCollapsedChange?: (collapsed: Set<string>) => void
}

const NO_ERRORS = (): string[] => []

const documentOf = (field: { template?: DocumentNode | null; value: DocumentNode | null }): DocumentNode | null | undefined =>
  field.template ? responseDocument(field.template, field.value) : field.value

export function SyllabusTeacherForm({
  sections,
  disabled = false,
  errors = NO_ERRORS,
  onValueChange,
  active,
  onActiveChange,
  collapsed,
  onCollapsedChange,
}: SyllabusTeacherFormProps) {
  const [localActive, setLocalActive] = useState("")
  const [localCollapsed, setLocalCollapsed] = useState<Set<string>>(() => new Set())
  const activeSectionId = active ?? localActive
  const closed = collapsed ?? localCollapsed

  const setActive = (id: string): void => {
    if (active === undefined) setLocalActive(id)
    onActiveChange?.(id)
  }
  const setClosed = (next: Set<string>): void => {
    if (collapsed === undefined) setLocalCollapsed(next)
    onCollapsedChange?.(next)
  }

  const conditions = syllabusConditions(sections, documentOf)
  const shownFields = (section: Section): SyllabusField[] => section.fields.filter((field) => !conditions.hidden.has(field.key))
  const visibleSections = sections.filter((section) => shownFields(section).some(isTeacherField))
  const currentId = visibleSections.find((section) => section.id === activeSectionId)?.id ?? visibleSections[0]?.id ?? ""
  const shownSections = visibleSections.filter((section) => section.id === currentId)
  const position = visibleSections.findIndex((section) => section.id === currentId)
  const previousSection = visibleSections[position - 1] ?? null
  const nextSection = visibleSections[position + 1] ?? null

  const goToSection = (id: string): void => {
    flushSync(() => setActive(id))
    document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }
  const openFields = (section: Section): string[] => section.fields.map((field) => field.id).filter((id) => !closed.has(id))
  const setOpenFields = (section: Section, open: string[]): void => {
    const next = new Set(closed)
    for (const { id } of section.fields) {
      if (open.includes(id)) next.delete(id)
      else next.add(id)
    }
    setClosed(next)
  }
  const written = (field: SyllabusField): number => fieldCharacters(field.template ?? null, documentOf(field), conditions.answers)

  return (
    <>
      {visibleSections.length > 1 ? (
        <Tabs value={currentId} className="w-full shrink-0" onValueChange={setActive}>
          <TooltipProvider>
            <TabsList className="h-auto w-full flex-wrap justify-start" aria-label="Secciones del sílabo">
              {visibleSections.map((section) => (
                <Tooltip key={section.id}>
                  <TooltipTrigger asChild>
                    <TabsTrigger value={section.id} className="h-10 max-w-64 flex-none px-4 data-[state=active]:font-semibold">
                      <span className="truncate">{section.title}</span>
                    </TabsTrigger>
                  </TooltipTrigger>
                  <TooltipContent>{section.title}</TooltipContent>
                </Tooltip>
              ))}
            </TabsList>
          </TooltipProvider>
        </Tabs>
      ) : null}
      {shownSections.map((section) => (
        <section
          key={section.id}
          id={`section-${section.id}`}
          className="teacher-form flex scroll-mt-6 flex-col gap-6 rounded-md bg-card px-6 py-6 text-card-foreground shadow-surface ring-1 ring-surface-ring"
        >
          <header className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">{section.title}</h2>
            {section.description ? <p className="text-sm text-muted-foreground">{section.description}</p> : null}
          </header>
          <FieldGroup>
            <Accordion type="multiple" className="-mx-1" value={openFields(section)} onValueChange={(open) => setOpenFields(section, open)}>
              {shownFields(section).map((field) => {
                const fieldErrors = errors(field.id)
                const limit = field.max_length ?? null
                const count = limit ? written(field) : 0
                return (
                  <AccordionItem key={field.id} value={field.id} data-field-key={field.key}>
                    {field.label.trim() ? (
                      <AccordionTrigger className="items-center px-1 hover:no-underline">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold">{fieldTitle(field, section)}</span>
                          {isTeacherField(field) ? (
                            <span className="text-destructive" aria-hidden="true">
                              *
                            </span>
                          ) : (
                            <Badge variant="outline" className="font-normal">
                              {responsibleLabel(field.quien_llena)}
                            </Badge>
                          )}
                        </span>
                      </AccordionTrigger>
                    ) : null}
                    <AccordionContent className="flex flex-col gap-3 px-1 pt-1">
                      {isTeacherField(field) ? (
                        <Field id={`field-${field.id}`} data-invalid={fieldErrors.length > 0 || (Boolean(limit) && count > limit!)}>
                          <FieldLabel htmlFor={`input-${field.id}`} required className="sr-only">
                            {fieldTitle(field, section)}
                          </FieldLabel>
                          <FieldResponseEditor
                            required
                            template={field.template}
                            label={fieldTitle(field, section)}
                            value={field.value}
                            id={`input-${field.id}`}
                            disabled={disabled}
                            answers={conditions.answers}
                            limit={limit}
                            onValueChange={(value) => onValueChange?.(field, value)}
                          />
                          {limit ? (
                            <p className={cn("text-sm tabular-nums", count >= limit ? "text-destructive" : "text-muted-foreground")} data-field-counter={field.id} aria-live="polite">
                              {counterLabel(count, limit)}
                              {count > limit ? " · Supera el límite: recorte el texto para enviar" : null}
                            </p>
                          ) : null}
                        </Field>
                      ) : (
                        <FieldView id={`field-${field.id}`} field={field} bare />
                      )}
                      <FieldError errors={fieldErrors} />
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
            </Accordion>
          </FieldGroup>
        </section>
      ))}
      {previousSection || nextSection ? (
        <nav className="-mt-4 flex items-center justify-between gap-2" aria-label="Secciones anterior y siguiente">
          {previousSection ? (
            <Button type="button" variant="outline" onClick={() => goToSection(previousSection.id)}>
              <ArrowLeft data-icon="inline-start" aria-hidden="true" />
              Anterior
            </Button>
          ) : (
            <span />
          )}
          {nextSection ? (
            <Button type="button" variant="outline" onClick={() => goToSection(nextSection.id)}>
              Siguiente
              <ArrowRight data-icon="inline-end" aria-hidden="true" />
            </Button>
          ) : null}
        </nav>
      ) : null}
    </>
  )
}
