"use client"

import { useQuery } from "@tanstack/react-query"
import { useParams } from "next/navigation"
import { AdminCareerStructurePending, CoordinationAcademicStructurePage, type AcademicStructureMode } from "@/app/(shell)/coordinacion/malla/CoordinationAcademicStructurePage"
import CoordinationCareerProjectPage, { AdminCareerProjectPending } from "@/app/(shell)/coordinacion/proyecto-carrera/CoordinationCareerProjectPage"
import CoordinationSubjectProfilePage, { SubjectProfilePending } from "@/app/(shell)/coordinacion/proyecto-carrera/[malla]/[subject]/CoordinationSubjectProfilePage"
import { sameCode, useCodeLookup } from "@/composables/useCodeLookup"
import { queryErrorMessage } from "@/lib/queryClient"
import { governanceQuery } from "@/queries/academic"

export type AdminCareerWork = AcademicStructureMode | "project" | "subject"

export default function AdminCareerWorkPage({ work }: { work: AdminCareerWork }) {
  const code = String(useParams<{ career?: string }>()?.career ?? "")
  const governance = useQuery(governanceQuery())
  const careerId = useCodeLookup(code, governance, (data) => data.catalogs.careers.find((career) => sameCode(career.code, code))?.id)

  if (careerId === null) {
    const error = queryErrorMessage(governance, "No se pudo abrir la carrera")
    const retry = (): void => void governance.refetch()
    if (work === "project") return <AdminCareerProjectPending careerCode={code} error={error} onRetry={retry} />
    if (work === "subject") return <SubjectProfilePending adminCareer={{ id: "", code }} error={error} onRetry={retry} />

    return <AdminCareerStructurePending mode={work} careerCode={code} error={error} onRetry={retry} />
  }

  const adminCareer = { id: careerId, code }
  if (work === "project") return <CoordinationCareerProjectPage key={careerId} adminCareer={adminCareer} />
  if (work === "subject") return <CoordinationSubjectProfilePage adminCareer={adminCareer} />

  return <CoordinationAcademicStructurePage key={careerId} mode={work} adminCareer={adminCareer} />
}
