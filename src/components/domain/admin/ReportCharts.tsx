"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import type { ProcessReport, ReportState } from "@/api/reports"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { formatDateDisplay } from "@/lib/dateDisplay"

type CareerRow = ProcessReport["careers"][number]
type DayRow = ProcessReport["daily"][number]

export const REPORT_STATES: ReportState[] = ["sin_iniciar", "borrador", "en_revision", "correccion_solicitada", "aprobado"]

export const REPORT_STATE_LABELS: Record<ReportState, string> = {
  sin_iniciar: "Sin iniciar",
  borrador: "Borrador",
  en_revision: "En revisión",
  correccion_solicitada: "Devuelto",
  aprobado: "Aprobado",
}

const STATE_COLORS: Record<ReportState, string> = {
  sin_iniciar: "var(--muted-foreground)",
  borrador: "var(--chart-4)",
  en_revision: "var(--primary)",
  correccion_solicitada: "var(--destructive)",
  aprobado: "var(--success)",
}

const statesConfig = Object.fromEntries(REPORT_STATES.map((state) => [state, { label: REPORT_STATE_LABELS[state], color: STATE_COLORS[state] }])) satisfies ChartConfig

const dailyConfig = {
  first: { label: "Primeros envíos", color: "var(--primary)" },
  resubmitted: { label: "Reenvíos", color: "var(--chart-4)" },
} satisfies ChartConfig

const returnsConfig = {
  coordinacion: { label: "Coordinación", color: "var(--primary)" },
  biblioteca: { label: "Biblioteca", color: "var(--chart-2)" },
} satisfies ChartConfig

const TOP_RADIUS: [number, number, number, number] = [4, 4, 0, 0]

const seriesOrder =
  (keys: readonly string[]) =>
  (item: { dataKey?: unknown }): number =>
    keys.indexOf(String(item.dataKey))

const STATES_ORDER = seriesOrder(REPORT_STATES)
const DAILY_ORDER = seriesOrder(Object.keys(dailyConfig))
const RETURNS_ORDER = seriesOrder(Object.keys(returnsConfig))

const yDomain: [number, (dataMax: number) => number] = [0, (dataMax) => Math.max(dataMax, 1)]

export const integerTicks = (values: number[]): number[] => {
  const top = Math.max(1, Math.ceil(Math.max(0, ...values)))
  const step = Math.ceil(top / 4)

  return Array.from({ length: Math.floor(top / step) + 1 }, (_, index) => index * step)
}

const dayName = (day: string): string => formatDateDisplay(`${day}T12:00:00`, { day: "numeric", month: "short" })

const axes = (ticks: number[]) => (
  <>
    <CartesianGrid vertical={false} />
    <XAxis dataKey="name" interval={0} tickLine={false} axisLine={false} tickMargin={8} />
    <YAxis ticks={ticks} domain={yDomain} allowDecimals={false} tickLine={false} axisLine={false} width="auto" />
  </>
)

export function ReportStatesChart({ careers }: { careers: CareerRow[] }) {
  const data = careers.map((row) => ({ name: row.career, ...row.states }))
  const ticks = integerTicks(careers.map((row) => REPORT_STATES.reduce((sum, state) => sum + row.states[state], 0)))

  return (
    <ChartContainer config={statesConfig} className="aspect-auto h-72">
      <BarChart data={data} margin={{ top: 8 }} barCategoryGap="25%">
        {axes(ticks)}
        <ChartTooltip cursor={false} itemSorter={STATES_ORDER} content={<ChartTooltipContent />} />
        <ChartLegend itemSorter={STATES_ORDER} content={<ChartLegendContent />} />
        {REPORT_STATES.map((state, index) => (
          <Bar key={state} dataKey={state} stackId="states" fill={`var(--color-${state})`} radius={index === REPORT_STATES.length - 1 ? TOP_RADIUS : 0} />
        ))}
      </BarChart>
    </ChartContainer>
  )
}

export function ReportDailyChart({ daily }: { daily: DayRow[] }) {
  const data = daily.map((row) => ({ name: dayName(row.day), first: row.first, resubmitted: row.resubmitted }))
  const ticks = integerTicks(daily.flatMap((row) => [row.first, row.resubmitted]))

  return (
    <ChartContainer config={dailyConfig} className="aspect-auto h-72">
      <BarChart data={data} margin={{ top: 8 }} barCategoryGap="30%">
        {axes(ticks)}
        <ChartTooltip itemSorter={DAILY_ORDER} content={<ChartTooltipContent />} />
        <ChartLegend itemSorter={DAILY_ORDER} content={<ChartLegendContent />} />
        <Bar dataKey="first" fill="var(--color-first)" radius={TOP_RADIUS} />
        <Bar dataKey="resubmitted" fill="var(--color-resubmitted)" radius={TOP_RADIUS} />
      </BarChart>
    </ChartContainer>
  )
}

export function ReportReturnsChart({ careers }: { careers: CareerRow[] }) {
  const data = careers.map((row) => ({ name: row.career, coordinacion: row.returns.coordinacion, biblioteca: row.returns.biblioteca }))
  const ticks = integerTicks(careers.flatMap((row) => [row.returns.coordinacion, row.returns.biblioteca]))

  return (
    <ChartContainer config={returnsConfig} className="aspect-auto h-64">
      <BarChart data={data} margin={{ top: 8 }} barCategoryGap="30%">
        {axes(ticks)}
        <ChartTooltip cursor={false} itemSorter={RETURNS_ORDER} content={<ChartTooltipContent />} />
        <ChartLegend itemSorter={RETURNS_ORDER} content={<ChartLegendContent />} />
        <Bar dataKey="coordinacion" fill="var(--color-coordinacion)" radius={TOP_RADIUS} />
        <Bar dataKey="biblioteca" fill="var(--color-biblioteca)" radius={TOP_RADIUS} />
      </BarChart>
    </ChartContainer>
  )
}
