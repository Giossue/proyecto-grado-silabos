"use client"

import * as React from "react"

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

const isControl = (element: Element): element is Control =>
  element instanceof HTMLInputElement ||
  element instanceof HTMLSelectElement ||
  element instanceof HTMLTextAreaElement

const isEmptyAriaRequired = (element: Control): boolean =>
  element.getAttribute("aria-required") === "true" &&
  !element.disabled &&
  element.value.trim() === ""

const hasMissingFields = (form: HTMLFormElement): boolean =>
  Array.from(form.elements).some(
    (element) =>
      isControl(element) &&
      ((element.willValidate && !element.validity.valid) ||
        isEmptyAriaRequired(element))
  )

const submitForm = (element: HTMLElement | null): HTMLFormElement | null => {
  if (!(element instanceof HTMLButtonElement) || element.type !== "submit")
    return null
  const form = element.form
  return form === null || form.noValidate ? null : form
}

export function useFormIncomplete(element: HTMLElement | null): boolean {
  const form = submitForm(element)
  const subscribe = React.useCallback(
    (notify: () => void) => {
      if (form === null) return () => undefined
      form.addEventListener("input", notify, true)
      form.addEventListener("change", notify, true)
      const observer = new MutationObserver(notify)
      observer.observe(form, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["required", "aria-required", "disabled"],
      })
      return () => {
        form.removeEventListener("input", notify, true)
        form.removeEventListener("change", notify, true)
        observer.disconnect()
      }
    },
    [form]
  )
  return React.useSyncExternalStore(
    subscribe,
    () => form !== null && hasMissingFields(form),
    () => false
  )
}
