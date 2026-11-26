"use client"

import { Plus } from "lucide-react"
import { useState } from "react"
import { toRoman, type RelationMode } from "@/components/domain/academic/curriculum/curriculumCanvasLayout"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useOpened } from "@/composables/useModelOpen"
import { useShownWhileClosing } from "@/lib/dialogExit"
import { useFocusReturn } from "@/lib/focusReturn"
import type { CurriculumBuilderSubject } from "@/types/academic"

export type RelationPickerState = { subjectId: string; mode: RelationMode } | null
export type PendingConnection = { sourceId: string; targetId: string }

type CurriculumRelationPickerProps = {
  subjects: CurriculumBuilderSubject[]
  picker: RelationPickerState
  onPickerChange: (picker: RelationPickerState) => void
  onPick: (connection: PendingConnection) => void
}

export function CurriculumRelationPicker({ subjects, picker, onPickerChange, onPick }: CurriculumRelationPickerProps) {
  const [chosen, setChosen] = useState("")
  useFocusReturn(picker !== null)
  const shown = useShownWhileClosing(picker)
  useOpened(picker !== null, () => setChosen(""))

  const current = subjects.find((subject) => subject.id === shown?.subjectId) ?? null
  const options = subjects
    .filter((subject) => subject.id !== shown?.subjectId)
    .filter((subject) => {
      const cycle = current?.cycle ?? 0
      return shown?.mode === "requires" ? (subject.cycle ?? 0) < cycle : (subject.cycle ?? 0) > cycle
    })
    .sort((left, right) => (left.cycle ?? 0) - (right.cycle ?? 0) || left.position - right.position)
  const byCycle = new Map<number, CurriculumBuilderSubject[]>()
  for (const subject of options) byCycle.set(subject.cycle ?? 0, [...(byCycle.get(subject.cycle ?? 0) ?? []), subject])
  const groups = [...byCycle.entries()].map(([cycle, list]) => ({ cycle, list }))
  const question = shown?.mode === "requires" ? "¿Qué materia requiere?" : "¿De qué materia es requisito?"

  const confirm = (): void => {
    const subject = picker?.subjectId
    if (!subject || !chosen) return
    onPick(picker.mode === "requires" ? { sourceId: chosen, targetId: subject } : { sourceId: subject, targetId: chosen })
    onPickerChange(null)
  }

  return (
    <Dialog
      open={picker !== null}
      onOpenChange={(open) => {
        if (!open) onPickerChange(null)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva relación académica</DialogTitle>
          <DialogDescription>Elija cómo se relacionan las dos materias</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="curriculum-relation-subject">{question}</FieldLabel>
          <Select value={chosen} onValueChange={setChosen}>
            <SelectTrigger id="curriculum-relation-subject" className="w-full">
              <SelectValue placeholder="Seleccione una materia" />
            </SelectTrigger>
            <SelectContent>
              {groups.map((group) => (
                <SelectGroup key={group.cycle}>
                  <SelectLabel>Ciclo {group.cycle ? toRoman(group.cycle) : "—"}</SelectLabel>
                  {group.list.map((subject) => (
                    <SelectItem key={subject.id} value={subject.id}>
                      {subject.code} · {subject.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onPickerChange(null)}>
            Cancelar
          </Button>
          <Button type="button" disabled={!chosen} onClick={confirm}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            Agregar relación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
