"use client"

import { FilterX } from "lucide-react"
import { useEffect, useRef, type ReactNode } from "react"
import { MobileFilterSheet } from "@/components/domain/MobileFilterSheet"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"

type FilterToolbarProps = {
  delay?: number
  active: boolean
  onClear: () => void
  search?: ReactNode
  filters?: ReactNode
}

const formFor = (target: EventTarget | null): HTMLFormElement | null => (target instanceof HTMLElement ? target.closest("form") : null)

export function FilterToolbar({ delay = 400, active, onClear, search, filters }: FilterToolbarProps) {
  const root = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancel = (): void => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
  }

  useEffect(() => {
    const node = root.current
    if (node === null) return
    const stop = (): void => {
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = null
    }
    const submit = (target: EventTarget | null): void => {
      stop()
      formFor(target)?.requestSubmit()
    }
    const onInput = (event: Event): void => {
      stop()
      const target = event.target
      timer.current = setTimeout(() => submit(target), delay)
    }
    const onChange = (event: Event): void => {
      const target = event.target
      if (target instanceof HTMLInputElement && !["checkbox", "radio"].includes(target.type)) return
      submit(target)
    }
    node.addEventListener("input", onInput)
    node.addEventListener("change", onChange)

    return () => {
      node.removeEventListener("input", onInput)
      node.removeEventListener("change", onChange)
      stop()
    }
  }, [delay])

  const clear = (): void => {
    cancel()
    onClear()
  }

  return (
    <FieldGroup ref={root} data-tour="filters" className="gap-3 lg:flex-row lg:flex-wrap lg:items-end [&_[data-slot=select-trigger]]:bg-card [&_input]:bg-card">
      {search ? <div className="min-w-0 lg:min-w-64 lg:flex-1">{search}</div> : null}
      <MobileFilterSheet className="grid min-w-0 gap-3 sm:grid-cols-2 lg:flex lg:max-w-full lg:flex-none lg:flex-wrap lg:items-end [&_[data-slot=field]]:min-w-0 lg:[&_[data-slot=field]]:w-48 lg:[&_[data-slot=field]]:shrink-0 [&_[data-slot=select-trigger]]:w-full">
        {filters}
        {active ? (
          <Button type="button" variant="ghost" className="max-sm:w-full" onClick={clear}>
            <FilterX />
            Quitar filtros
          </Button>
        ) : null}
      </MobileFilterSheet>
      <Button type="submit" className="sr-only" tabIndex={-1}>
        Buscar
      </Button>
    </FieldGroup>
  )
}
