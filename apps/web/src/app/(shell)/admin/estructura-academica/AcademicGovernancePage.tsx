"use client"

import { Building2, Plus, TriangleAlert } from "lucide-react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { CatalogRecordDialog } from "@/components/domain/academic/CatalogRecordDialog"
import { CatalogSection } from "@/components/domain/academic/CatalogSection"
import { ImportSpreadsheetDialog } from "@/components/domain/ImportSpreadsheetDialog"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { PageFrame } from "@/components/domain/PageFrame"
import { ProcessLockAlert } from "@/components/domain/ProcessLockAlert"
import { Button } from "@/components/ui/button"
import { paths } from "@/lib/routes"
import { toast } from "@/lib/toast"
import { queryErrorMessage } from "@/lib/queryClient"
import { governanceQuery } from "@/queries/academic"

const careerColumns = [
  { key: "facultad", label: "Facultad" },
  { key: "modalidad", label: "Modalidad" },
  { key: "codigo", label: "Código" },
  { key: "nombre", label: "Nombre" },
  { key: "ciclos", label: "Ciclos" },
]
const createLabel = "Crear carrera"

export default function AcademicGovernancePage() {
  const router = useRouter()
  const params = useParams<{ section?: string }>()
  const searchParams = useSearchParams()
  const [careerOpen, setCareerOpen] = useState(false)
  const periodRoute = searchParams.get("seccion") === "periodo" || params?.section === "periodos-academicos"
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

  return (
    <>
      <PageFrame
        title="Facultades y carreras"
        description="Las carreras y a qué facultad pertenece cada una"
        icon={Building2}
        size="wide"
        loading={!data && !error}
        actionsSkeleton={loading && !data ? ["w-44", "w-34"] : []}
        banner={
          data?.convocation_in_progress ? (
            <ProcessLockAlert
              banner
              hideAction
              icon={TriangleAlert}
              title="Hay un proceso de sílabos en curso"
              message="Si cambia una facultad o carrera, sus sílabos enviados o aprobados vuelven a Borrador"
              why="Los sílabos llevan datos de la facultad y de la carrera, como el logo, el nombre, el código y la modalidad. Si alguno cambia, los sílabos enviados o aprobados vuelven a Borrador para actualizarse con los datos nuevos."
            />
          ) : null
        }
        actions={
          <>
            {data ? (
              <ImportSpreadsheetDialog title="Importar carreras" kind="careers" templateName="plantilla-carreras.xlsx" columns={careerColumns} onImported={(message) => void changed(message)} />
            ) : null}
            {data ? (
              <Button type="button" className="w-full max-sm:size-14 max-sm:rounded-full max-sm:p-0 sm:w-auto" aria-label={createLabel} onClick={() => setCareerOpen(true)}>
                <Plus data-icon="inline-start" aria-hidden="true" />
                <span className="max-sm:hidden">{createLabel}</span>
              </Button>
            ) : null}
          </>
        }
      >
        {error ? <LoadErrorState message={error} onRetry={() => void load()} /> : null}
        {loading && !data && !error ? <LoadingSkeleton variant="catalog" columns={5} filters={2} actions={false} filterWidth="lg:w-44" /> : null}

        {data ? <CatalogSection catalogs={data.catalogs} options={data.options} onChanged={(message) => void changed(message)} /> : null}
      </PageFrame>
      {data ? <CatalogRecordDialog open={careerOpen} onOpenChange={setCareerOpen} showTrigger={false} entity="carrera" options={data.options} onSaved={(message) => void changed(message)} /> : null}
    </>
  )
}
