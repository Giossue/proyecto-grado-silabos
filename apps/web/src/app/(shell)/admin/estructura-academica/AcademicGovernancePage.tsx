"use client"

import { Building2, GraduationCap, Plus, TriangleAlert } from "lucide-react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { type AcademicEntity } from "@/api/academic"
import { CatalogRecordDialog } from "@/components/domain/academic/CatalogRecordDialog"
import { CatalogSection } from "@/components/domain/academic/CatalogSection"
import { ImportSpreadsheetDialog } from "@/components/domain/ImportSpreadsheetDialog"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { PageFrame } from "@/components/domain/PageFrame"
import { ProcessLockAlert } from "@/components/domain/ProcessLockAlert"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { paths } from "@/lib/routes"
import { toast } from "@/lib/toast"
import type { GovernanceSection } from "@/types/academic"
import { queryErrorMessage } from "@/lib/queryClient"
import { governanceQuery } from "@/queries/academic"

type CatalogEntity = Exclude<AcademicEntity, "periodo">

const sectionMap: Record<CatalogEntity, GovernanceSection> = { facultad: "faculties", carrera: "careers" }
const routeSections: Array<{ value: CatalogEntity; label: string }> = [
  { value: "facultad", label: "Facultades" },
  { value: "carrera", label: "Carreras" },
]
const tabIcons = { facultad: Building2, carrera: GraduationCap }
const routeParamSections: Record<string, CatalogEntity> = { facultades: "facultad", carreras: "carrera" }
const sectionContent = {
  facultad: { title: "Facultades", description: "Las facultades de la universidad" },
  carrera: { title: "Carreras", description: "Las carreras y a qué facultad pertenece cada una" },
}
const careerColumns = [
  { key: "facultad", label: "Facultad" },
  { key: "modalidad", label: "Modalidad" },
  { key: "codigo", label: "Código" },
  { key: "nombre", label: "Nombre" },
  { key: "ciclos", label: "Ciclos" },
]

export default function AcademicGovernancePage() {
  const router = useRouter()
  const params = useParams<{ section?: string }>()
  const searchParams = useSearchParams()
  const [facultyOpen, setFacultyOpen] = useState(false)
  const [careerOpen, setCareerOpen] = useState(false)
  const querySection = searchParams.get("seccion")
  const periodRoute = querySection === "periodo" || params?.section === "periodos-academicos"
  const entity: CatalogEntity = routeSections.some((item) => item.value === querySection)
    ? (querySection as CatalogEntity)
    : (routeParamSections[String(params?.section)] ?? "facultad")
  const content = sectionContent[entity]
  const createLabel = entity === "facultad" ? "Crear facultad" : "Crear carrera"
  const query = useQuery({ ...governanceQuery(), enabled: !periodRoute })
  const data = query.data ?? null
  const loading = query.isPending || query.isFetching
  const error = queryErrorMessage(query, "No se pudieron cargar las facultades y carreras")

  useEffect(() => {
    if (query.data === null) router.replace(paths.dashboard)
    else if (periodRoute) router.replace(paths.admin.convocations)
  }, [periodRoute, query.data, router])

  const load = (): Promise<void> => query.refetch().then(() => undefined)

  const changed = async (notice: string): Promise<void> => {
    toast.success(notice)
    await load()
  }

  const openCreationDialog = (): void => {
    if (entity === "facultad") setFacultyOpen(true)
    else setCareerOpen(true)
  }

  return (
    <>
      <PageFrame
        title={content.title}
        description={content.description}
        icon={tabIcons[entity]}
        size="wide"
        loading={!data && !error}
        actionsSkeleton={loading && !data ? (entity === "carrera" ? ["w-44", "w-34"] : ["w-36"]) : []}
        banner={
          data?.convocation_in_progress ? (
            <ProcessLockAlert
              banner
              hideAction
              icon={TriangleAlert}
              title="Hay un periodo académico en curso"
              message="Si cambia una facultad o carrera, sus sílabos enviados o aprobados vuelven a Borrador"
              why="Los sílabos llevan datos de la facultad y de la carrera, como el logo, el nombre, el código y la modalidad. Si alguno cambia, los sílabos enviados o aprobados vuelven a Borrador para actualizarse con los datos nuevos."
            />
          ) : null
        }
        actions={
          <>
            {data && entity === "carrera" ? (
              <ImportSpreadsheetDialog title="Importar carreras" kind="careers" templateName="plantilla-carreras.xlsx" columns={careerColumns} onImported={(message) => void changed(message)} />
            ) : null}
            {data ? (
              <Button type="button" className="w-full max-sm:size-14 max-sm:rounded-full max-sm:p-0 sm:w-auto" aria-label={createLabel} onClick={openCreationDialog}>
                <Plus data-icon="inline-start" aria-hidden="true" />
                <span className="max-sm:hidden">{createLabel}</span>
              </Button>
            ) : null}
          </>
        }
      >
        {data || error ? (
          <Tabs value={entity} className="-mb-3" onValueChange={(value) => router.replace(paths.admin.academicWithSection(value))}>
            <TabsList className="h-11 justify-start">
              {routeSections.map((item) => {
                const Icon = tabIcons[item.value]

                return (
                  <TabsTrigger key={item.value} value={item.value} className="flex-none gap-2 px-4 data-[state=active]:font-semibold">
                    <Icon />
                    {item.label}
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </Tabs>
        ) : null}

        {error ? <LoadErrorState message={error} onRetry={() => void load()} /> : null}
        {loading && !data && !error ? (
          <LoadingSkeleton
            variant="catalog"
            tabs={2}
            columns={entity === "carrera" ? 4 : 3}
            filters={entity === "carrera" ? 2 : 1}
            actions={false}
            filterWidth="lg:w-44"
            widths={entity === "facultad" ? ["minmax(0, 2fr)", "minmax(0, 1fr)", "5rem"] : undefined}
          />
        ) : null}

        {data ? <CatalogSection section={sectionMap[entity]} catalogs={data.catalogs} options={data.options} onChanged={(message) => void changed(message)} /> : null}
      </PageFrame>
      {data ? (
        <>
          <CatalogRecordDialog open={facultyOpen} onOpenChange={setFacultyOpen} showTrigger={false} entity="facultad" options={data.options} onSaved={(message) => void changed(message)} />
          <CatalogRecordDialog open={careerOpen} onOpenChange={setCareerOpen} showTrigger={false} entity="carrera" options={data.options} onSaved={(message) => void changed(message)} />
        </>
      ) : null}
    </>
  )
}
