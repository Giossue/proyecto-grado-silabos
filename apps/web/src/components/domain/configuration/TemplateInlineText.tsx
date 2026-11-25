"use client"

import { useEffect, useImperativeHandle, useRef, type FocusEvent, type KeyboardEvent, type Ref } from "react"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export type TemplateInlineTextHandle = { focus: () => void }

type TemplateInlineTextProps = {
  value: string
  onValueChange: (value: string) => void
  label: string
  maxLength?: number
  disabled?: boolean
  placeholder?: string
  className?: string
  autoFocus?: boolean
  onAutoFocused?: () => void
  onFocus?: (event: FocusEvent<HTMLTextAreaElement>) => void
  onBlur?: (event: FocusEvent<HTMLTextAreaElement>) => void
  ref?: Ref<TemplateInlineTextHandle>
}

const sizesItself = (): boolean => typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content") === true

export function TemplateInlineText({ value, onValueChange, label, maxLength, disabled = false, placeholder, className, autoFocus = false, onAutoFocused, onFocus, onBlur, ref }: TemplateInlineTextProps) {
  const area = useRef<HTMLTextAreaElement | null>(null)
  const autoFocused = useRef(false)
  const focus = (): void => {
    area.current?.focus()
    area.current?.select()
  }

  useImperativeHandle(ref, () => ({ focus }), [])

  useEffect(() => {
    const element = area.current
    if (sizesItself() || !element) return
    element.style.height = "auto"
    element.style.height = `${element.scrollHeight}px`
  }, [value])

  useEffect(() => {
    if (!autoFocus || autoFocused.current) return
    autoFocused.current = true
    area.current?.focus()
    area.current?.select()
    onAutoFocused?.()
  }, [autoFocus, onAutoFocused])

  const finish = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== "Enter") return
    event.preventDefault()
    event.currentTarget.blur()
  }

  return (
    <Textarea
      ref={area}
      value={value}
      maxLength={maxLength}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={label}
      rows={1}
      className={cn("block h-auto min-h-0 w-full resize-none overflow-hidden rounded-none border-0 bg-transparent p-0 text-[length:inherit] leading-[inherit] shadow-none [font-weight:inherit] [letter-spacing:inherit] focus-visible:ring-0 disabled:cursor-default disabled:opacity-100 md:text-[length:inherit]", className)}
      onChange={(event) => onValueChange(event.target.value.replace(/\s*\n\s*/g, " "))}
      onKeyDown={finish}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  )
}
