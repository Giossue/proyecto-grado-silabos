"use client"

import * as React from "react"
import { cn } from "cn"

import { useFieldControl } from "@/components/ui/field-context"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  const control = useFieldControl(props["aria-describedby"])

  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-border placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/30 aria-invalid:border-destructive flex field-sizing-content min-h-16 w-full rounded-md border bg-field px-3 py-2 text-base shadow-control transition-[color,box-shadow] outline-hidden focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      {...props}
      {...control}
    />
  )
}

export { Textarea }
