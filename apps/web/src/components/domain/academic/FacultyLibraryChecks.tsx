"use client"

import { Info } from "lucide-react"
import type { CatalogLibrary } from "@/api/libraryCatalog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type FacultyLibraryChecksProps = {
  libraries: CatalogLibrary[] | null
  error: string | null
  saved?: string[]
  idPrefix: string
  invalid?: string[]
  disabled?: boolean
  value: string[]
  onValueChange: (value: string[]) => void
}

export function FacultyLibraryChecks({ libraries, error, saved = [], idPrefix, invalid, disabled, value, onValueChange }: FacultyLibraryChecksProps) {
  const known = libraries ?? []
  const gone = saved.filter((code) => !known.some((library) => library.id === code))
  const rows: CatalogLibrary[] = [...known, ...gone.map((code) => ({ id: code, name: `${code} (ya no está en Koha)` }))]

  const toggle = (code: string, checked: boolean | "indeterminate"): void => {
    onValueChange(checked === true ? [...new Set([...value, code])] : value.filter((item) => item !== code))
  }

  return (
    <FieldSet>
      <FieldLegend variant="label" className="flex items-center gap-1">
        Bibliotecas disponibles
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" className="size-6" aria-label="Qué significa esto">
                <Info aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">Aplica solo a los libros físicos. Los digitales no dependen de esto y cualquier docente puede agregarlos</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </FieldLegend>
      {error ? (
        <FieldDescription>{error}</FieldDescription>
      ) : libraries === null ? (
        <p className="text-sm text-muted-foreground">Consultando Koha</p>
      ) : (
        <FieldGroup className="gap-3">
          {rows.map((library) => (
            <Field key={library.id} orientation="horizontal">
              <Checkbox
                id={`${idPrefix}-${library.id}`}
                disabled={disabled}
                checked={value.includes(library.id)}
                onCheckedChange={(checked) => toggle(library.id, checked)}
              />
              <FieldLabel htmlFor={`${idPrefix}-${library.id}`} className="font-normal">
                {library.name}
              </FieldLabel>
            </Field>
          ))}
        </FieldGroup>
      )}
      <FieldError errors={invalid} />
    </FieldSet>
  )
}
