"use client"

import { useState } from "react"
import { SupportDocumentsPanel } from "@/components/domain/academic/SupportDocumentsPanel"
import { PageFrame } from "@/components/domain/PageFrame"

export default function SupportDocumentsPage() {
  const [loading, setLoading] = useState(true)

  return (
    <PageFrame title="Documentos de apoyo" description="Material de la carrera para sus asignaturas" size="wide" loading={loading}>
      <SupportDocumentsPanel manages={false} onLoadingChange={setLoading} />
    </PageFrame>
  )
}
