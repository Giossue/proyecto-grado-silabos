import { formatNumericDisplay } from "@/lib/numberDisplay"

export type CycleNodeData = { cycle: number; level: string; subjectCount: number; totalHours: number }

export function CurriculumCycleNode({ data }: { data: CycleNodeData }) {
  return (
    <section className="size-full cursor-default overflow-hidden rounded-md bg-(--curriculum-lane) ring-1 ring-surface-ring" aria-label={`Nivel ${data.level}`}>
      <div className="flex h-full">
        <header className="flex w-20 shrink-0 flex-col items-center justify-center gap-1 border-r bg-(--curriculum-cycle-chrome) p-3 text-center">
          <span className="text-xs text-muted-foreground uppercase">Nivel</span>
          <strong className="text-lg">{data.level}</strong>
        </header>
        <div className="flex-1" />
        <div className="flex w-20 shrink-0 flex-col items-center justify-center gap-1 border-l bg-(--curriculum-cycle-chrome) p-3 text-center">
          <span className="text-xs text-muted-foreground">Asignaturas</span>
          <strong className="text-sm">{data.subjectCount}</strong>
        </div>
        <div className="flex w-20 shrink-0 flex-col items-center justify-center gap-1 border-l bg-(--curriculum-cycle-chrome) p-3 text-center">
          <span className="text-xs text-muted-foreground">Total</span>
          <strong className="text-sm">{formatNumericDisplay(data.totalHours)}</strong>
        </div>
      </div>
    </section>
  )
}
