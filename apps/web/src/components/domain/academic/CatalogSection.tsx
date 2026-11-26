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
import type { AcademicStructureProps, CatalogRecord, GovernanceSection } from "@/types/academic"

type Career = AcademicStructureProps["catalogs"]["careers"][number]

type CatalogSectionProps = Pick<AcademicStructureProps, "catalogs" | "options"> & {
  section: GovernanceSection
  onChanged: (message: string) => void
}

const facultySearch = (item: CatalogRecord) => [item.nombre]
const careerSearch = (item: Career) => [item.name]
const careerFilters: Record<string, ClientFilterDefinition<Career>> = {
  modalidad: { matches: (item, value) => item.modality === value },
}

const NO_LIBRARIES: string[] = []

const facultyColumns = {
  name: { label: "Facultad", value: (item: CatalogRecord) => item.nombre },
} satisfies SortColumns<CatalogRecord>

export function CatalogSection({ section, catalogs, options, onChanged }: CatalogSectionProps) {
  const [editingId, setEditingId] = useState<string | null>(null)

  const facultyNames = useMemo(() => new Map(catalogs.faculties.map((faculty) => [faculty.id, faculty.nombre])), [catalogs.faculties])
  const facultyName = (facultyId: string): string => facultyNames.get(facultyId) ?? "Facultad no disponible"
  const careerColumns = useMemo(
    () =>
      ({
        name: { label: "Carrera", value: (item: Career) => item.name },
        faculty: { label: "Facultad", value: (item: Career) => facultyNames.get(item.faculty_id) ?? "Facultad no disponible" },
        modality: { label: "Modalidad", value: (item: Career) => item.modality_label },
      }) satisfies SortColumns<Career>,
    [facultyNames],
  )

  const facultyFilter = useClientFilter(catalogs.faculties, facultySearch)
  const facultySort = useTableSort(facultyFilter.items, facultyColumns)
  const facultyPage = useClientPagination(facultySort.items, 20, `${facultyFilter.criteria}|${facultySort.criteria}`)
  const careerFilter = useClientFilter(catalogs.careers, careerSearch, careerFilters)
  const careerSort = useTableSort(careerFilter.items, careerColumns)
  const careerPage = useClientPagination(careerSort.items, 20, `${careerFilter.criteria}|${careerSort.criteria}`)

  const editRecord = (id: string): void => setEditingId(id)
  const editOpenChange = (id: string) => (open: boolean) => setEditingId((current) => (open ? id : current === id ? null : current))



  return (
    <>
      {section === "faculties" ? (
        <div className="flex flex-col gap-4">
          <ClientFilterBar
            filter={facultyFilter}
            inputId="faculties-search"
            label="Buscar facultad"
            placeholder="Buscar por nombre"
            sort={facultySort}
          />
          <Table label="Listado académico">
            <TableHeader>
              <TableRow>
                <SortableHead sort={facultySort} column="name">Facultad</SortableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {facultyPage.items.length === 0 ? (
                <TableEmpty colSpan={1}>{facultyFilter.active ? "Ninguna facultad coincide con los filtros" : "No existen facultades registradas"}</TableEmpty>
              ) : (
                facultyPage.items.map((faculty) => (
                  <TableRow
                    key={faculty.id}
                    className="cursor-pointer"
                    onClick={(event) => activateRow(event.nativeEvent, () => editRecord(faculty.id))}
                  >
                    <TableCell>
                      <button type="button" className={rowButtonClass} onClick={() => editRecord(faculty.id)}>{faculty.nombre}</button>
                      {!faculty.activo ? (
                        <span className="ml-2 inline-flex">
                          <StatusBadge label="Inactiva" tone="neutral" />
                        </span>
                      ) : null}
                      <CatalogActions
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
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <SortStatus sort={facultySort} />
          <TablePagination meta={facultyPage.meta} label="Paginación de facultades" onPageChange={facultyPage.setPage} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <ClientFilterBar
            filter={careerFilter}
            inputId="careers-search"
            label="Buscar carrera"
            placeholder="Buscar por nombre"
            sort={careerSort}
            filters={
              <Field>
                <FieldLabel htmlFor="careers-search-modality" className="sr-only">
                  Modalidad
                </FieldLabel>
                <Select value={careerFilter.values.modalidad} onValueChange={(value) => careerFilter.setValue("modalidad", value)}>
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
                <SortableHead sort={careerSort} column="name">Carrera</SortableHead>
                <SortableHead sort={careerSort} column="faculty">Facultad</SortableHead>
                <SortableHead sort={careerSort} column="modality">Modalidad</SortableHead>
                <TableHead className="w-24">
                  <span className="sr-only">Trabajo de la carrera</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {careerPage.items.length === 0 ? (
                <TableEmpty colSpan={4}>{careerFilter.active ? "Ninguna carrera coincide con los filtros" : "No existen carreras registradas"}</TableEmpty>
              ) : (
                careerPage.items.map((career) => (
                  <TableRow
                    key={career.id}
                    className="cursor-pointer"
                    onClick={(event) => activateRow(event.nativeEvent, () => editRecord(career.id))}
                  >
                    <TableCell>
                      <button type="button" className={rowButtonClass} onClick={() => editRecord(career.id)}>{career.name}</button>
                      {!career.active ? (
                        <span className="ml-2 inline-flex">
                          <StatusBadge label="Inactiva" tone="neutral" />
                        </span>
                      ) : null}
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
                    </TableCell>
                    <TableCell>{facultyName(career.faculty_id)}</TableCell>
                    <TableCell data-card-hide="true">{career.modality_label ?? "Sin modalidad"}</TableCell>
                    <TableCell>{career.active ? <CareerWorkLinks careerId={career.id} careerName={career.name} /> : null}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <SortStatus sort={careerSort} />
          <TablePagination meta={careerPage.meta} label="Paginación de carreras" onPageChange={careerPage.setPage} />
        </div>
      )}

    </>
  )
}
