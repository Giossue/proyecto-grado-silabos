"use client"

import { Check, ChevronDown } from "lucide-react"
import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

type TeacherSelectProps = {
  teachers: Array<{ id: string; name: string }>
  label: string
  value: string
  onValueChange: (value: string) => void
  id?: string
  required?: boolean
  invalid?: boolean
}

const normalize = (value: string): string =>
  value
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()

const matchesName = (_value: string, search: string, keywords?: string[]): number => (normalize((keywords ?? []).join(" ")).includes(normalize(search)) ? 1 : 0)

export function TeacherSelect({ teachers, label, value, onValueChange, id, required, invalid }: TeacherSelectProps) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const selectedName = value === "none" ? "Sin docente" : (teachers.find((teacher) => teacher.id === value)?.name ?? "Elija el docente")

  const select = (next: string): void => {
    onValueChange(next)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listId}
          aria-required={required || undefined}
          aria-invalid={invalid || undefined}
          className="max-w-60 min-w-40 justify-between"
        >
          <span className="truncate">{selectedName}</span>
          <ChevronDown data-icon="inline-end" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 min-w-(--radix-popover-trigger-width) p-0">
        <Command filter={matchesName}>
          <CommandInput placeholder="Buscar por nombre" aria-label="Buscar docente por nombre" />
          <CommandList id={listId} aria-label={label}>
            <CommandEmpty>
              <span role="status">No se encontraron docentes</span>
            </CommandEmpty>
            <CommandGroup>
              {teachers.map((teacher) => (
                <CommandItem key={teacher.id} value={teacher.id} keywords={[teacher.name]} onSelect={() => select(teacher.id)}>
                  {teacher.name}
                  {value === teacher.id ? <Check className="ml-auto" aria-hidden="true" /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
