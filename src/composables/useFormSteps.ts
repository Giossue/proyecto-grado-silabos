import { useState } from "react"
import { cn } from "@/lib/utils"

type StepDirection = "forward" | "back"

export function useFormSteps<Step extends number>(first: Step) {
  const [step, setStep] = useState<Step>(first)
  const [direction, setDirection] = useState<StepDirection | null>(null)

  const goTo = (target: Step): void => {
    if (target === step) return
    setDirection(target > step ? "forward" : "back")
    setStep(target)
  }

  const reset = (): void => {
    setStep(first)
    setDirection(null)
  }

  const stepClassName =
    direction === null
      ? undefined
      : cn("animate-in fade-in-0 duration-200 motion-reduce:animate-none", direction === "forward" ? "slide-in-from-right-8" : "slide-in-from-left-8")

  return { step, goTo, reset, stepClassName }
}
