"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Progress as ProgressPrimitive } from "radix-ui"

const progressIndicatorVariants = cva(
  "h-full w-full flex-1 transition-transform duration-300",
  {
    variants: {
      tone: {
        default: "bg-primary",
        destructive: "bg-destructive",
        warning: "bg-warning",
        success: "bg-success",
      },
    },
    defaultVariants: {
      tone: "default",
    },
  }
)

function Progress({
  className,
  value = 0,
  max = 100,
  tone = "default",
  ...props
}: Omit<React.ComponentProps<typeof ProgressPrimitive.Root>, "value" | "max"> &
  VariantProps<typeof progressIndicatorVariants> & {
    value?: number
    max?: number
  }) {
  const maximum = Math.max(1, max)
  const current = Math.min(maximum, Math.max(0, value))
  const offset = 100 - (current / maximum) * 100

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={current}
      max={maximum}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-muted",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={progressIndicatorVariants({ tone })}
        style={{ transform: `translateX(-${offset}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
