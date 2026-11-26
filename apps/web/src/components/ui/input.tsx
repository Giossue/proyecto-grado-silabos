"use client"

import * as React from "react"
import { cn } from "cn"
import { SearchIcon } from "lucide-react"

import { useFieldControl } from "@/components/ui/field-context"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  const control = useFieldControl(props["aria-describedby"])
  const classes = cn(
    "file:text-foreground placeholder:text-muted-foreground border-border h-9 w-full min-w-0 rounded-md border bg-field px-3 py-1 text-base shadow-control transition-[color,box-shadow] outline-hidden file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:cursor-not-allowed disabled:opacity-50 disabled:caret-transparent md:text-sm",
    "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3",
    "aria-invalid:ring-destructive/30 aria-invalid:border-destructive",
    "[&::-webkit-search-cancel-button]:appearance-none",
    type === "search" && "pl-9",
    className
  )
  const input = (
    <input
      type={type}
      data-slot="input"
      className={classes}
      {...props}
      {...control}
    />
  )

  if (type !== "search") return input

  return (
    <div className="relative w-full min-w-0">
      <SearchIcon
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      {input}
    </div>
  )
}

export { Input }
