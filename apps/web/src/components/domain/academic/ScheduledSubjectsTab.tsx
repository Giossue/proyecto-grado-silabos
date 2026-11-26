"use client"

import { useState } from "react"
import type { ScheduledSubjects, TeacherAssignments } from "@/api/career-academics"
import { ParallelBulkActions } from "@/components/domain/academic/ParallelBulkActions"
import { ParallelCreationDialog } from "@/components/domain/academic/ParallelCreationDialog"
import { ClientFilterBar } from "@/components/domain/ClientFilterBar"
import { StatusBadge } from "@/components/domain/StatusBadge"
import { TablePagination } from "@/components/domain/TablePagination"
import { SortableHead, SortStatus } from "@/components/domain/TableSort"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useClientFilter, type ClientFilterDefinition } from "@/composables/useClientFilter"
import { useClientPagination } from "@/composables/useClientPagination"
import { useTableSort, type SortColumns } from "@/composables/useTableSort"
import { shiftLabel } from "@/lib/parallelShifts"
import { activateRow, rowButtonClass } from "@/lib/rowActivation"
import { cn } from "@/lib/utils"

// `malla_name` comes with each subject since careers can have several mallas (S8).
type ScheduledRow = ScheduledSubjects["scheduledSubjects"][number] & { malla_name?: string | null }
type CheckState = boolean | "indeterminate"

type ScheduledSubjectsTabProps = {
  data: ScheduledSubjects
  assignments: TeacherAssignments["teacherAssignments"]
  teacherUsers: TeacherAssignments["options"]["teacherUsers"]
  onChanged: (message: string) => void
  onFailed: (message: string) => void
}

const cycleKey = (item: ScheduledRow): string => (item.subject_cycle === null ? "none" : String(item.subject_cycle))
const shiftKey = (shift: string | null | undefined): string => shift ?? "none"
const searchable = (item: ScheduledRow) => [item.subject_name]
const mallaOf = (item: ScheduledRow): string => item.malla_name ?? ""
const filters: Record<string, ClientFilterDefinition<ScheduledRow>> = {
  malla: { matches: (item, value) => mallaOf(item) === value },
  ciclo: { matches: (item, value) => cycleKey(item) === value },
  paralelo: { matches: (item, value) => item.parallels.some((parallel) => parallel.code === value) },
  jornada: { matches: (item, value) => item.parallels.some((parallel) => shiftKey(parallel.shift) === value) },
}
const sortColumns = {
  subject: { label: "Materia", value: (item: ScheduledRow) => item.subject_name },
  cycle: { label: "Ciclo", type: "number", value: (item: ScheduledRow) => item.subject_cycle },
} satisfies SortColumns<ScheduledRow>
const canPlan = (item: ScheduledRow): boolean => item.editable
const selectableParallels = (item: ScheduledRow) => item.parallels.filter((parallel) => parallel.editable !== false)

export function ScheduledSubjectsTab({ data, assignments, teacherUsers, onChanged, onFailed }: ScheduledSubjectsTabProps) {
  const rows: ScheduledRow[] = data.scheduledSubjects
  const shiftOptions = data.options.shiftOptions
  const filter = useClientFilter(rows, searchable, filters)
  const sort = useTableSort(filter.items, sortColumns)
  const pagination = useClientPagination(sort.items, 20, `${filter.criteria}|${sort.criteria}`)
  const [planningId, setPlanningId] = useState<string | null>(null)
  const [planningOpen, setPlanningOpen] = useState(false)
  const [selectedParallels, setSelectedParallels] = useState<string[]>([])
  const [selectedBare, setSelectedBare] = useState<string[]>([])
  const [selectionRows, setSelectionRows] = useState(rows)

  if (selectionRows !== rows) {
    setSelectionRows(rows)
    setSelectedParallels((current) => current.filter((id) => rows.some((item) => item.parallels.some((parallel) => parallel.id === id))))
    setSelectedBare((current) => current.filter((id) => rows.some((item) => item.subject_id === id)))
  }

  const cycleOptions = [
    ...new Map(
      rows.map((item) => [
        cycleKey(item),
        { value: cycleKey(item), label: item.subject_cycle === null ? "Sin ciclo" : String(item.subject_cycle), order: item.subject_cycle ?? Number.MAX_SAFE_INTEGER },
      ]),
    ).values(),
  ].sort((a, b) => a.order - b.order)
  const mallas = [...new Set(rows.map(mallaOf).filter((name) => name !== ""))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }))
  const severalMallas = mallas.length > 1
  const parallelOptions = [...new Set(rows.flatMap((item) => item.parallels.map((parallel) => parallel.code)))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }))
  const shiftChoices = [
    ...new Map(rows.flatMap((item) => item.parallels).map((parallel) => [shiftKey(parallel.shift), { value: shiftKey(parallel.shift), label: shiftLabel(parallel.shift, shiftOptions) }])).values(),
  ].sort((a, b) => a.label.localeCompare(b.label, "es"))
  const teacherByParallel = new Map(assignments.filter((item) => item.active).map((item) => [item.parallel_id, item.user_name]))
  const planning = rows.find((item) => item.subject_id === planningId) ?? null

  const subjectState = (item: ScheduledRow): CheckState => {
    const parallels = selectableParallels(item)
    if (parallels.length === 0) return selectedBare.includes(item.subject_id)
    const count = parallels.filter((parallel) => selectedParallels.includes(parallel.id)).length

    return count === 0 ? false : count === parallels.length ? true : "indeterminate"
  }
  const selectableItems = filter.items.filter(canPlan)
  const selectedRows = rows.filter((item) => subjectState(item) !== false)
  const states = selectableItems.map(subjectState)
  const fullCount = states.filter((state) => state === true).length
  const someCount = states.filter((state) => state !== false).length
  const allSelected: CheckState = someCount === 0 ? false : fullCount === selectableItems.length ? true : "indeterminate"

  const setSubjects = (items: ScheduledRow[], checked: boolean): void => {
    const bare = items.filter((item) => selectableParallels(item).length === 0).map((item) => item.subject_id)
    const parallels = items.flatMap((item) => selectableParallels(item).map((parallel) => parallel.id))
    setSelectedBare((current) => (checked ? [...new Set([...current, ...bare])] : current.filter((id) => !bare.includes(id))))
    setSelectedParallels((current) => (checked ? [...new Set([...current, ...parallels])] : current.filter((id) => !parallels.includes(id))))
  }
  const toggleParallel = (id: string, checked: CheckState): void => {
    setSelectedParallels((current) => (checked === true ? [...new Set([...current, id])] : current.filter((item) => item !== id)))
  }
  const clearSelection = (): void => {
    setSelectedParallels([])
    setSelectedBare([])
  }

  const openPlanning = (item: ScheduledRow): void => {
    setPlanningId(item.subject_id)
    setPlanningOpen(true)
  }

  const filterSelect = (key: string, id: string, label: string, placeholder: string, allLabel: string, options: { value: string; label: string }[]) => (
    <Field>
      <FieldLabel htmlFor={id} className="sr-only">
        {label}
      </FieldLabel>
      <Select value={filter.values[key]} onValueChange={(value) => filter.setValue(key, value)}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">{allLabel}</SelectItem>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )

  const parallelSelectLabel = (item: ScheduledRow, code: string): string => `Seleccionar el paralelo ${code} de ${item.label}`

  return (
    <div className="flex flex-col gap-4">
      <ClientFilterBar
        filter={filter}
        inputId="scheduled-subjects-search"
        label="Buscar materia programada"
        placeholder="Buscar por materia"
        sort={sort}
        filters={
          <>
            {severalMallas
              ? filterSelect(
                  "malla",
                  "scheduled-subject-malla",
                  "Malla",
                  "Todas las mallas",
                  "Todas las mallas",
                  mallas.map((name) => ({ value: name, label: name })),
                )
              : null}
            {filterSelect("ciclo", "scheduled-subject-cycle", "Ciclo", "Todos los ciclos", "Todos los ciclos", cycleOptions)}
            {filterSelect(
              "paralelo",
              "scheduled-subject-parallel",
              "Paralelo",
              "Todos los paralelos",
              "Todos los paralelos",
              parallelOptions.map((code) => ({ value: code, label: code })),
            )}
            {filterSelect("jornada", "scheduled-subject-shift", "Jornada", "Todas las jornadas", "Todas las jornadas", shiftChoices)}
          </>
        }
      />
      {selectedRows.length ? (
        <ParallelBulkActions
          items={selectedRows}
          parallelIds={selectedParallels}
          shiftOptions={shiftOptions}
          teacherUsers={teacherUsers}
          assignments={assignments}
          onChanged={onChanged}
          onFailed={onFailed}
          onClear={clearSelection}
        />
      ) : null}
      <Table label="Materias programadas">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              {selectableItems.length ? <Checkbox checked={allSelected} aria-label="Seleccionar las materias visibles" onCheckedChange={(checked) => setSubjects(selectableItems, checked === true)} /> : null}
            </TableHead>
            <SortableHead sort={sort} column="subject">Materia</SortableHead>
            <SortableHead sort={sort} column="cycle" className="text-center">Ciclo</SortableHead>
            <TableHead className="text-center">Paralelos</TableHead>
            <TableHead className="text-center">Jornada</TableHead>
            <TableHead>Docente</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!pagination.items.length ? (
            <TableEmpty colSpan={6}>{filter.active ? "No hay materias que coincidan con los filtros" : "No hay materias en la malla"}</TableEmpty>
          ) : (
            pagination.items.map((item) => (
              <TableRow
                key={item.subject_id}
                className={canPlan(item) ? "cursor-pointer" : ""}
                onClick={(event) => {
                  if (canPlan(item)) activateRow(event.nativeEvent, () => openPlanning(item))
                }}
              >
                <TableCell>
                  {canPlan(item) ? (
                    <Checkbox checked={subjectState(item)} aria-label={`Seleccionar ${item.label}`} onCheckedChange={(checked) => setSubjects([item], checked === true)} />
                  ) : null}
                </TableCell>
                <TableCell>
                  <span className="flex flex-wrap items-center gap-2">
                    {canPlan(item) ? (
                      <button type="button" className={rowButtonClass} aria-haspopup="dialog" onClick={() => openPlanning(item)}>{item.subject_name}</button>
                    ) : (
                      item.subject_name
                    )}
                    {severalMallas && mallaOf(item) !== "" ? <Badge variant="outline">{mallaOf(item)}</Badge> : null}
                    {item.generates_syllabus === false ? <StatusBadge label="Sin sílabo" tone="info" /> : null}
                  </span>
                </TableCell>
                <TableCell className="text-center">{item.subject_cycle === null ? "Sin ciclo" : item.subject_cycle}</TableCell>
                <TableCell data-card-hide="true" className="py-0 text-center">
                  {item.parallels.length ? (
                    <ul className="-mx-2 flex min-h-11 flex-col">
                      {item.parallels.map((parallel) => (
                        <li key={parallel.id} className="flex min-h-9 flex-1 items-center justify-center gap-2 border-border px-2 not-first:border-t">
                          {canPlan(item) && parallel.editable !== false ? (
                            <Checkbox
                              checked={selectedParallels.includes(parallel.id)}
                              aria-label={parallelSelectLabel(item, parallel.code)}
                              onCheckedChange={(checked) => toggleParallel(parallel.id, checked)}
                            />
                          ) : canPlan(item) ? (
                            <span className="size-4 shrink-0" aria-hidden="true" />
                          ) : null}
                          <span className="min-w-0 break-all">{parallel.code}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-muted-foreground">Sin paralelos</span>
                  )}
                </TableCell>
                <TableCell data-card-hide="true" className="py-0 text-center">
                  {item.parallels.length ? (
                    <ul className="-mx-2 flex min-h-11 flex-col">
                      {item.parallels.map((parallel) => (
                        <li key={parallel.id} className="flex min-h-9 flex-1 items-center justify-center border-border px-2 not-first:border-t">
                          {shiftLabel(parallel.shift, shiftOptions)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell data-card-hide="true" className="py-0">
                  {item.parallels.length ? (
                    <ul className="-mx-2 flex min-h-11 flex-col">
                      {item.parallels.map((parallel) => (
                        <li
                          key={parallel.id}
                          className={cn("flex min-h-9 flex-1 items-center border-border px-2 not-first:border-t", !teacherByParallel.get(parallel.id) && "text-muted-foreground")}
                        >
                          {teacherByParallel.get(parallel.id) ?? "Sin docente"}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="sm:hidden" data-card-span="full">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Paralelos</p>
                  {item.parallels.length ? (
                    <ul className="flex flex-col divide-y divide-border rounded-md ring-1 ring-surface-ring">
                      {item.parallels.map((parallel) => (
                        <li key={parallel.id} className="flex flex-col gap-0.5 px-3 py-2">
                          <span className="flex items-center gap-2">
                            {canPlan(item) && parallel.editable !== false ? (
                              <Checkbox
                                checked={selectedParallels.includes(parallel.id)}
                                aria-label={parallelSelectLabel(item, parallel.code)}
                                onCheckedChange={(checked) => toggleParallel(parallel.id, checked)}
                              />
                            ) : null}
                            <span className="font-semibold">Paralelo {parallel.code}</span>
                            <span className="text-sm text-muted-foreground">{shiftLabel(parallel.shift, shiftOptions)}</span>
                          </span>
                          <span className={cn("text-sm", !teacherByParallel.get(parallel.id) && "text-muted-foreground")}>{teacherByParallel.get(parallel.id) ?? "Sin docente"}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-sm text-muted-foreground">Sin paralelos</span>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <SortStatus sort={sort} />
      <TablePagination meta={pagination.meta} label="Paginación de materias programadas" onPageChange={pagination.setPage} />
      {planning ? (
        <ParallelCreationDialog
          key={`parallel-${planning.subject_id}`}
          open={planningOpen}
          onOpenChange={setPlanningOpen}
          subjectId={planning.subject_id}
          subjectLabel={planning.label}
          parallels={planning.parallels}
          shiftOptions={shiftOptions}
          teacherUsers={teacherUsers}
          assignments={assignments}
          onSaved={onChanged}
          onChanged={onChanged}
        />
      ) : null}
    </div>
  )
}
