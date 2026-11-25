"use client"

import { Eye } from "lucide-react"
import { useState } from "react"
import { CatalogActions } from "@/components/domain/academic/CatalogActions"
import { ClientFilterBar } from "@/components/domain/ClientFilterBar"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { StatusBadge } from "@/components/domain/StatusBadge"
import { TableCardLine } from "@/components/domain/TableCardLine"
import { TablePagination } from "@/components/domain/TablePagination"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useClientFilter, type ClientFilterDefinition } from "@/composables/useClientFilter"
import { useClientPagination } from "@/composables/useClientPagination"
import { useFocusReturn } from "@/lib/focusReturn"
import { activateRow, rowButtonClass } from "@/lib/rowActivation"
import type { AcademicStructureProps, CatalogRecord, GovernanceSection } from "@/types/academic"

type Career = AcademicStructureProps["catalogs"]["careers"][number]

type CatalogSectionProps = Pick<AcademicStructureProps, "catalogs" | "options"> & {
  section: GovernanceSection
  onChanged: (message: string) => void
}

const facultySearch = (item: CatalogRecord) => [item.nombre]
const facultyFilters: Record<string, ClientFilterDefinition<CatalogRecord>> = {
  campus: { matches: (item, value) => item.campus === value },
}
const careerSearch = (item: Career) => [item.name]
const careerFilters: Record<string, ClientFilterDefinition<Career>> = {
  campus: { matches: (item, value) => item.campus_name === value },
  modalidad: { matches: (item, value) => item.modality === value },
}

const NO_LIBRARIES: string[] = []

export function CatalogSection({ section, catalogs, options, onChanged }: CatalogSectionProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [logoPreview, setLogoPreview] = useState<{ name: string; url: string } | null>(null)
  const [logoPreviewOpen, setLogoPreviewOpen] = useState(false)
  useFocusReturn(logoPreviewOpen)

  const facultyFilter = useClientFilter(catalogs.faculties, facultySearch, facultyFilters)
  const facultyPage = useClientPagination(facultyFilter.items, 20, facultyFilter.criteria)
  const careerFilter = useClientFilter(catalogs.careers, careerSearch, careerFilters)
  const careerPage = useClientPagination(careerFilter.items, 20, careerFilter.criteria)
  const facultyNames = new Map(catalogs.faculties.map((faculty) => [faculty.id, faculty.nombre]))
  const facultyName = (facultyId: string): string => facultyNames.get(facultyId) ?? "Facultad no disponible"

  const editRecord = (id: string): void => setEditingId(id)
  const editOpenChange = (id: string) => (open: boolean) => setEditingId((current) => (open ? id : current === id ? null : current))

  const openLogoPreview = (name: string, url: string): void => {
    setLogoPreview({ name, url })
    setLogoPreviewOpen(true)
  }

  const campusFilter = (id: string, filter: { values: Record<string, string>; setValue: (key: string, value: string) => void }) => (
    <Field>
      <FieldLabel htmlFor={id} className="sr-only">
        Campus
      </FieldLabel>
      <Select value={filter.values.campus} onValueChange={(value) => filter.setValue("campus", value)}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="Todos los campus" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">Todos los campus</SelectItem>
            {options.campusOptions.map((campus) => (
              <SelectItem key={campus.value} value={campus.value}>
                {campus.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )

  return (
    <>
      {section === "faculties" ? (
        <div className="flex flex-col gap-4">
          <ClientFilterBar
            filter={facultyFilter}
            inputId="faculties-search"
            label="Buscar facultad"
            placeholder="Buscar por nombre"
            filters={campusFilter("faculties-search-campus", facultyFilter)}
          />
          <Table label="Listado académico">
            <TableHeader>
              <TableRow>
                <TableHead>Facultad</TableHead>
                <TableHead>Campus</TableHead>
                <TableHead className="w-20 text-center">Logo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {facultyPage.items.length === 0 ? (
                <TableEmpty colSpan={3}>{facultyFilter.active ? "Ninguna facultad coincide con los filtros" : "No existen facultades registradas"}</TableEmpty>
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
                        campus={faculty.campus}
                        catalogLibraries={faculty.catalog_libraries ?? NO_LIBRARIES}
                        campusOptions={options.campusOptions}
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
                    <TableCell>{faculty.campus ?? "Sin campus"}</TableCell>
                    <TableCell className="text-center">
                      {faculty.logo_url ? (
                        <IconTooltip label="Ver logo">
                          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Ver logo de ${faculty.nombre}`} onClick={() => openLogoPreview(faculty.nombre, faculty.logo_url!)}>
                            <Eye aria-hidden="true" />
                          </Button>
                        </IconTooltip>
                      ) : (
                        <span className="text-sm text-muted-foreground">Sin logo</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TablePagination meta={facultyPage.meta} label="Paginación de facultades" onPageChange={facultyPage.setPage} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <ClientFilterBar
            filter={careerFilter}
            inputId="careers-search"
            label="Buscar carrera"
            placeholder="Buscar por nombre"
            filters={
              <>
                {campusFilter("careers-search-campus", careerFilter)}
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
              </>
            }
          />
          <Table label="Listado académico">
            <TableHeader>
              <TableRow>
                <TableHead>Carrera</TableHead>
                <TableHead>Facultad</TableHead>
                <TableHead>Modalidad</TableHead>
                <TableHead>Campus</TableHead>
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
                        {career.modality_label ?? "Sin modalidad"} · {career.campus_name ?? "Sin campus"}
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
                        campusOptions={options.campusOptions}
                        modalityOptions={options.modalityOptions}
                        editOpen={editingId === career.id}
                        onEditOpenChange={editOpenChange(career.id)}
                        onChanged={onChanged}
                      />
                    </TableCell>
                    <TableCell>{facultyName(career.faculty_id)}</TableCell>
                    <TableCell data-card-hide="true">{career.modality_label ?? "Sin modalidad"}</TableCell>
                    <TableCell data-card-hide="true">{career.campus_name ?? "Sin campus"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TablePagination meta={careerPage.meta} label="Paginación de carreras" onPageChange={careerPage.setPage} />
        </div>
      )}

      <Dialog open={logoPreviewOpen} onOpenChange={setLogoPreviewOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Logo de {logoPreview?.name}</DialogTitle>
            <DialogDescription>Así se verá en los sílabos</DialogDescription>
          </DialogHeader>
          {logoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoPreview.url} alt={`Logo de ${logoPreview.name}`} className="max-h-160 w-full object-contain" />
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cerrar
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
