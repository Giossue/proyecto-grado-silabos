import { Check } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

type StepProgressProps = { steps: readonly string[]; current: number; label: string; failed?: boolean }

export function StepProgress({ steps, current, label, failed = false }: StepProgressProps) {
  const state = (index: number): "done" | "current" | "pending" => {
    const step = index + 1
    if (step < current || (step === steps.length && step === current && !failed)) return "done"
    return step === current ? "current" : "pending"
  }
  const variant = (index: number) => (state(index) === "done" ? "default" : state(index) === "pending" ? "secondary" : failed ? "destructive" : "outline")
  const status = (index: number): string => (state(index) === "done" ? " (completado)" : state(index) === "current" ? (failed ? " (con error)" : " (actual)") : "")

  return (
    <nav aria-label={label}>
      <ol className="flex items-center gap-2">
        {steps.map((title, index) => (
          <li key={title} className="flex min-w-0 items-center gap-2 not-last:flex-1" aria-current={index + 1 === current ? "step" : undefined}>
            <Badge size="step" variant={variant(index)}>
              {state(index) === "done" ? <Check aria-hidden="true" /> : index + 1}
            </Badge>
            <span className={cn("truncate text-sm", state(index) === "pending" ? "text-muted-foreground" : "font-medium", index + 1 !== current && "max-sm:sr-only")}>
              {title}
              <span className="sr-only">{status(index)}</span>
            </span>
            {index < steps.length - 1 ? <Separator className="min-w-4 flex-1" /> : null}
          </li>
        ))}
      </ol>
    </nav>
  )
}
