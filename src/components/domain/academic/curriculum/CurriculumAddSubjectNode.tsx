"use client"

import { Button } from "@/components/ui/button"

export type AddSubjectNodeData = { cycle: number; disabled: boolean }

export function CurriculumAddSubjectNode({ data, onAdd }: { data: AddSubjectNodeData; onAdd: (cycle: number) => void }) {
  return (
    <Button type="button" variant="outline" data-tour="curriculum-add" className="nodrag nopan w-64 border-dashed" disabled={data.disabled} onClick={() => onAdd(data.cycle)}>
      Agregar materia
    </Button>
  )
}
