"use client"

import { useMemo, useState } from "react"
import { CareerWorkLinks } from "@/components/domain/academic/CareerWorkLinks"
import { CatalogActions } from "@/components/domain/academic/CatalogActions"
import { ClientFilterBar } from "@/components/domain/ClientFilterBar"
import { StatusBadge } from "@/components/domain/StatusBadge"
import { TableCardLine } from "@/components/domain/TableCardLine"
import { TablePagination } from "@/components/domain/TablePagination"
import { SortableHead, SortStatus } from "@/components/domain/TableSort"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useClientFilter, type ClientFilterDefinition } from "@/composables/useClientFilter"
import { useClientPagination } from "@/composables/useClientPagination"
import { useTableSort, type SortColumns } from "@/composables/useTableSort"
import { activateRow, rowButtonClass } from "@/lib/rowActivation"
import type { AcademicStructureProps, CatalogRecord } from "@/types/academic"

type Career = AcademicStructureProps["catalogs"]["careers"][number]

type CatalogSectionProps = Pick<AcademicStructureProps, "catalogs" | "options"> & {
  onChanged: (message: string) => void
}

// One row per career with its faculty; a faculty without careers keeps a row of its own so it stays reachable.
type CatalogRow = { id: string; career: Career | null; faculty: CatalogRecord | undefined; facultyName: string }

const catalogRows = ({ faculties, careers }: AcademicStructureProps["catalogs"]): CatalogRow[] => {
  const byId = new Map(faculties.map((faculty) => [faculty.id, faculty]))
  const used = new Set(careers.map((career) => career.faculty_id))

  return [
    ...careers.map((career) => {
      const faculty = byId.get(career.faculty_id)

      return { id: career.id, career, faculty, facultyName: faculty?.nombre ?? "Facultad no disponible" }
    }),
    ...faculties.filter((faculty) => !used.has(faculty.id)).map((faculty) => ({ id: faculty.id, career: null, faculty, facultyName: faculty.nombre })),
  ]
}

const rowSearch = (row: CatalogRow) => [row.career?.name ?? "", row.facultyName]
const rowFilters: Record<string, ClientFilterDefinition<CatalogRow>> = {
  modalidad: { matches: (row, value) => row.career?.modality === value },
}
const rowColumns = {
  name: { label: "Carrera", value: (row: CatalogRow) => row.career?.name ?? null },
  faculty: { label: "Facultad", value: (row: CatalogRow) => row.facultyName },
  modality: { label: "Modalidad", value: (row: CatalogRow) => row.career?.modality_label ?? null },
  cycles: { label: "Ciclos", type: "number", value: (row: CatalogRow) => row.career?.cycle_count ?? null },
} satisfies SortColumns<CatalogRow>

const NO_LIBRARIES: string[] = []

const inactiveBadge = (
  <span className="ml-2 inline-flex">
    <StatusBadge label="Inactiva" tone="neutral" />
  </span>
)

export function CatalogSection({ catalogs, options, onChanged }: CatalogSectionProps) {
  const [editingId, setEditingId] = useState<string | null>(null)

  const rows = useMemo(() => catalogRows(catalogs), [catalogs])
  const filter = useClientFilter(rows, rowSearch, rowFilters)
  const sort = useTableSort(filter.items, rowColumns)
  const page = useClientPagination(sort.items, 20, `${filter.criteria}|${sort.criteria}`)
  // Several rows may share a faculty: its dialog is mounted once, outside the table.
  const pageFaculties = [...new Set(page.items.flatMap((row) => (row.faculty ? [row.faculty] : [])))]

  const editRecord = (id: string): void => setEditingId(id)
  const editOpenChange = (id: string) => (open: boolean) => setEditingId((current) => (open ? id : current === id ? null : current))

  return (
    <div className="flex flex-col gap-4">
      <ClientFilterBar
        filter={filter}
        inputId="careers-search"
        label="Buscar carrera o facultad"
        placeholder="Buscar por carrera o facultad"
        sort={sort}
        filters={
          <Field>
            <FieldLabel htmlFor="careers-search-modality" className="sr-only">
              Modalidad
            </FieldLabel>
            <Select value={filter.values.modalidad} onValueChange={(value) => filter.setValue("modalidad", value)}>
              <SelectTrigger id="careers-search-modality">
                <SelectValue placeholder="Todas las modalidades" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">Todas las modalidades</SelectItem>
                  {options.modalityOptions.map((modality) => (
                    <SelectItem key={modality.value} value={modality.value}>
                      {modality.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        }
      />
      <Table label="Listado académico">
        <TableHeader>
          <TableRow>
            <SortableHead sort={sort} column="name">Carrera</SortableHead>
            <SortableHead sort={sort} column="faculty">Facultad</SortableHead>
            <SortableHead sort={sort} column="modality" className="text-center">Modalidad</SortableHead>
            <SortableHead sort={sort} column="cycles" className="text-center">Ciclos</SortableHead>
            <TableHead className="w-12">
              <span className="sr-only">Trabajo de la carrera</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page.items.length === 0 ? (
            <TableEmpty colSpan={5}>{filter.active ? "Ninguna carrera ni facultad coincide con los filtros" : "No existen facultades ni carreras registradas"}</TableEmpty>
          ) : (
            page.items.map(({ id, career, faculty, facultyName }) => (
              <TableRow
                key={id}
                className="cursor-pointer"
                onClick={(event) => activateRow(event.nativeEvent, () => editRecord(id))}
              >
                <TableCell>
                  {career ? (
                    <>
                      <button type="button" className={rowButtonClass} onClick={() => editRecord(career.id)}>{career.name}</button>
                      {!career.active ? inactiveBadge : null}
                      <TableCardLine>
                        {career.modality_label ?? "Sin modalidad"}
                      </TableCardLine>
                      <CatalogActions
                        entity="carrera"
                        recordId={career.id}
                        recordName={career.name}
                        recordCode={career.code}
                        active={career.active}
                        deactivateBlockedReason={career.deactivate_block ?? null}
                        deactivateUsers={career.deactivate_users ?? null}
                        lockReason={career.lock_reason ?? null}
                        facultyId={career.faculty_id}
                        modality={career.modality}
                        faculties={catalogs.faculties}
                        modalityOptions={options.modalityOptions}
                        editOpen={editingId === career.id}
                        onEditOpenChange={editOpenChange(career.id)}
                        onChanged={onChanged}
                      />
                    </>
                  ) : (
                    <span className="text-muted-foreground">Sin carreras</span>
                  )}
                </TableCell>
                <TableCell>
                  {faculty ? (
                    <>
                      <button type="button" className={rowButtonClass} onClick={() => editRecord(faculty.id)}>{faculty.nombre}</button>
                      {!faculty.activo ? inactiveBadge : null}
                    </>
                  ) : (
                    facultyName
                  )}
                </TableCell>
                <TableCell className="text-center" data-card-hide="true">{career ? (career.modality_label ?? "Sin modalidad") : "—"}</TableCell>
                <TableCell className="text-center" data-card-hide="true" title="Ciclos de la malla vigente">{career ? (career.cycle_count ?? "Sin malla vigente") : "—"}</TableCell>
                <TableCell>{career?.active ? <CareerWorkLinks careerId={career.id} careerName={career.name} /> : null}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <SortStatus sort={sort} />
      <TablePagination meta={page.meta} label="Paginación de facultades y carreras" onPageChange={page.setPage} />
      {pageFaculties.map((faculty) => (
        <CatalogActions
          key={faculty.id}
          entity="facultad"
          recordId={faculty.id}
          recordName={faculty.nombre}
          active={faculty.activo}
          catalogLibraries={faculty.catalog_libraries ?? NO_LIBRARIES}
          modalityOptions={options.modalityOptions}
          logoUrl={faculty.logo_url}
          faculties={catalogs.faculties}
          deactivateBlockedReason={faculty.deactivate_block ?? null}
          lockReason={faculty.lock_reason ?? null}
          editOpen={editingId === faculty.id}
          onEditOpenChange={editOpenChange(faculty.id)}
          onChanged={onChanged}
        />
      ))}
    </div>
  )
}
