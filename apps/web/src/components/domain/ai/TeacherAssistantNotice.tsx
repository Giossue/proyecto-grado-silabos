"use client"

import { ChevronDown, Info } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

const SENT = [
  "Lo que usted escribe aquí y lo reciente de esta conversación",
  "El nombre de la asignatura, sus horas, créditos y semanas",
  "El contenido de los campos que usted puede editar y que Administración permite leer",
]

const KEPT = ["Los datos de estudiantes con discapacidad", "Los nombres y correos de la identificación"]

function NoticeList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-medium">{title}</p>
      <ul className="flex list-disc flex-col gap-0.5 pl-5 text-muted-foreground">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  )
}

export function TeacherAssistantNotice({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="flex min-h-0 shrink flex-col items-start gap-2 overflow-y-auto overscroll-contain border-b px-4 py-3 *:shrink-0">
      {children}
      <CollapsibleTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Info data-icon="inline-start" aria-hidden="true" />
          Qué se envía
          <ChevronDown data-icon="inline-end" className={cn("transition-transform", open && "rotate-180")} aria-hidden="true" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="w-full">
        <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-3 text-sm leading-snug">
          <p>No ponga datos personales aquí ni en los campos: el sistema no reconoce los nombres escritos dentro de un texto</p>
          <NoticeList title="Se envía a DeepSeek" items={SENT} />
          <NoticeList title="No se envía" items={KEPT} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
