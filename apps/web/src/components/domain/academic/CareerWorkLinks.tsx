"use client"

import { MoreHorizontal } from "lucide-react"
import Link from "next/link"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { Button } from "@/components/ui/button"
import { paths } from "@/lib/routes"

export function CareerWorkLinks({ careerCode, careerName }: { careerCode: string; careerName: string }) {
  return (
    <div data-slot="table-actions" className="flex justify-end">
      <IconTooltip label="Abrir carrera">
        <Button asChild variant="ghost" size="icon-sm">
          <Link href={paths.admin.careerCurriculum(careerCode)} aria-label={`Abrir carrera ${careerName}`}>
            <MoreHorizontal aria-hidden="true" />
          </Link>
        </Button>
      </IconTooltip>
    </div>
  )
}
