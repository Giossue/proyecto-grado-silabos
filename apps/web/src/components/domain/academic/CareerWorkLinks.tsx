"use client"

import { FolderOpen, Network } from "lucide-react"
import Link from "next/link"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { Button } from "@/components/ui/button"
import { paths } from "@/lib/routes"

export function CareerWorkLinks({ careerId, careerName }: { careerId: string; careerName: string }) {
  return (
    <div data-slot="table-actions" className="flex justify-end gap-1">
      <IconTooltip label="Malla y paralelos">
        <Button asChild variant="ghost" size="icon-sm">
          <Link href={paths.admin.careerCurriculum(careerId)} aria-label={`Malla y paralelos de ${careerName}`}>
            <Network aria-hidden="true" />
          </Link>
        </Button>
      </IconTooltip>
      <IconTooltip label="Proyecto de carrera">
        <Button asChild variant="ghost" size="icon-sm">
          <Link href={paths.admin.careerProject(careerId)} aria-label={`Proyecto de carrera de ${careerName}`}>
            <FolderOpen aria-hidden="true" />
          </Link>
        </Button>
      </IconTooltip>
    </div>
  )
}
