"use client"

import { ListChecks } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { setupChecklistState, useSetupChecklist } from "@/state/setupChecklist"

const plain = (text: string): string => text.replace(/\.$/, "")

export function SetupNextStepBanner() {
  const { steps, start: startStep } = useSetupChecklist()
  const index = steps.findIndex((step) => !step.done)
  const start = startStep?.done === false ? startStep : null
  const next = index === -1 ? start : steps[index]

  if (!next) return null

  return (
    <div role="status" data-setup-next-step className="flex h-11 items-center gap-3 border-y border-primary/20 bg-primary/5 px-4 text-sm sm:px-6">
      <ListChecks className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="shrink-0 font-medium max-sm:min-w-0 max-sm:shrink max-sm:truncate">{index === -1 ? "Último paso" : `Paso ${index + 1} de ${steps.length}`}: {plain(next.label)}</span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="min-w-0 truncate text-muted-foreground max-sm:hidden">{plain(next.hint)}</span>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">{plain(next.hint)}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Button type="button" variant="link" size="sm" className="h-auto shrink-0 px-0" onClick={() => setupChecklistState.requestOpen()}>Ver los pasos</Button>
    </div>
  )
}
