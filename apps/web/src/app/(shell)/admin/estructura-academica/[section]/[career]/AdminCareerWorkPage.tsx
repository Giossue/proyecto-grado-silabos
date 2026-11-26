"use client"

import { notFound, useParams } from "next/navigation"
import { CoordinationAcademicStructurePage, type AcademicStructureMode } from "@/app/(shell)/coordinacion/malla/CoordinationAcademicStructurePage"
import CoordinationCareerProjectPage from "@/app/(shell)/coordinacion/proyecto-carrera/CoordinationCareerProjectPage"
import CoordinationSubjectProfilePage from "@/app/(shell)/coordinacion/proyecto-carrera/[subject]/CoordinationSubjectProfilePage"

export type AdminCareerWork = AcademicStructureMode | "project" | "subject"

export default function AdminCareerWorkPage({ work }: { work: AdminCareerWork }) {
  const params = useParams<{ section?: string; career?: string }>()
  const careerId = String(params?.career ?? "")
  if (params?.section !== "carreras" || careerId === "") notFound()
  if (work === "project") return <CoordinationCareerProjectPage key={careerId} careerId={careerId} />
  if (work === "subject") return <CoordinationSubjectProfilePage careerId={careerId} />

  return <CoordinationAcademicStructurePage key={careerId} mode={work} careerId={careerId} />
}
