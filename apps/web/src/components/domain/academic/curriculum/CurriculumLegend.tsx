import type { CSSProperties } from "react"

type CurriculumLegendProps = {
  units: { unit: string; style: CSSProperties }[]
  rows: { id: string; label: string; value: string }[]
}

export function CurriculumLegend({ units, rows }: CurriculumLegendProps) {
  return (
    <div className="flex flex-col gap-2 text-xs">
      <dl className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <dt className="h-0.5 w-5 shrink-0 rounded bg-(--curriculum-prerequisite)" aria-hidden="true" />
          <dd>Prerrequisito</dd>
        </div>
      </dl>
      {units.length > 0 ? (
        <dl className="flex flex-col gap-1 border-t pt-2">
          {units.map((item) => (
            <div key={item.unit} className="flex items-center gap-2">
              <dt className="size-3 shrink-0 rounded-sm" style={item.style} aria-hidden="true" />
              <dd className="leading-tight">{item.unit}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <dl className="flex flex-col gap-1 border-t pt-2">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-3">
            <dt className="truncate text-muted-foreground">{row.label}</dt>
            <dd className="font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
