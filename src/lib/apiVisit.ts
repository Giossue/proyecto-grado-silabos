import { useCallback, useMemo, useRef, useState } from "react"
import { ApiError, api } from "@/api/client"
import { requestPurgeConfirmation } from "@/composables/usePurgeConfirmation"

export type ApiErrors = Record<string, string>
export type ApiVisitOptions = {
  method?: string
  data?: Record<string, unknown> | FormData
  preserveScroll?: boolean
  preserveState?: boolean
  preserveUrl?: boolean
  preserveErrors?: boolean
  onSuccess?: (payload?: unknown) => void
  onError?: (errors: ApiErrors) => void
  onFinish?: () => void
}

type BeforeVisit = {
  method: string
  url: string | URL
  data: Record<string, unknown> | FormData
}

type BeforeVisitEvent = {
  detail: { visit: BeforeVisit }
  preventDefault: () => void
}

type BeforeVisitListener = (event: BeforeVisitEvent) => void
const beforeVisitListeners = new Set<BeforeVisitListener>()

const flattenErrors = (error: ApiError): ApiErrors => {
  const errors = Object.fromEntries(Object.entries(error.errors).map(([key, values]) => [key, values[0] ?? error.message]))

  return Object.keys(errors).length > 0 ? errors : { request: error.message }
}

const withConfirmation = (data: Record<string, unknown> | FormData): Record<string, unknown> | FormData => {
  if (data instanceof FormData) {
    const confirmed = new FormData()
    data.forEach((value, key) => confirmed.append(key, value))
    confirmed.set("confirm_purge", "1")
    return confirmed
  }

  return { ...data, confirm_purge: true }
}

const bodyFor = (data: Record<string, unknown> | FormData): BodyInit => (data instanceof FormData ? data : JSON.stringify(data))

export const visitApi = async (url: string, options: ApiVisitOptions = {}): Promise<void> => {
  const method = (options.method ?? "GET").toUpperCase()
  const data = options.data ?? {}

  let prevented = false
  const event: BeforeVisitEvent = {
    detail: { visit: { method, url, data } },
    preventDefault: () => {
      prevented = true
    },
  }

  for (const listener of [...beforeVisitListeners]) listener(event)

  if (prevented) {
    options.onFinish?.()
    return
  }

  try {
    const payload = await api<unknown>(url, {
      method,
      ...(method === "GET" || method === "HEAD" ? {} : { body: bodyFor(data) }),
    })
    window.dispatchEvent(new CustomEvent("silabos:template-changed"))
    options.onSuccess?.(payload)
  } catch (reason) {
    if (reason instanceof ApiError) {
      const errors = flattenErrors(reason)
      const purgeMessage = errors.purge_required

      if (purgeMessage) {
        requestPurgeConfirmation(
          purgeMessage,
          Number(errors.purge_count ?? 0),
          () => visitApi(url, { ...options, data: withConfirmation(data) }),
          undefined,
          errors.purge_mode,
        )
      }

      options.onError?.(errors)
    } else {
      options.onError?.({ request: "No se pudo completar la solicitud" })
    }
  } finally {
    options.onFinish?.()
  }
}

type FormDataShape = Record<string, unknown>
type FormOptions = Omit<ApiVisitOptions, "method" | "data">

export type ApiForm<T extends FormDataShape> = T & {
  processing: boolean
  errors: ApiErrors
  data: () => T
  setData: <K extends keyof T>(key: K, value: T[K]) => void
  clearErrors: (...keys: string[]) => void
  reset: (...keys: (keyof T)[]) => void
  transform: (callback: (data: T) => Record<string, unknown>) => void
  post: (url: string, options?: FormOptions) => void
  patch: (url: string, options?: FormOptions) => void
  delete: (url: string, options?: FormOptions) => void
}

export const useApiForm = <T extends FormDataShape>(initial: T): ApiForm<T> => {
  const [defaults] = useState(() => structuredClone(initial))
  const [values, setValues] = useState<T>(() => structuredClone(initial))
  const [processing, setProcessing] = useState(false)
  const [errors, setErrors] = useState<ApiErrors>({})
  const transformer = useRef<((data: T) => Record<string, unknown>) | null>(null)
  const latest = useRef(values)

  const setData = useCallback(<K extends keyof T>(key: K, value: T[K]): void => {
    latest.current = { ...latest.current, [key]: value }
    setValues(latest.current)
  }, [])

  const clearErrors = useCallback((...keys: string[]): void => {
    if (keys.length === 0) {
      setErrors({})
      return
    }
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !keys.includes(key))))
  }, [])

  const reset = useCallback(
    (...keys: (keyof T)[]): void => {
      const targets = keys.length > 0 ? keys : (Object.keys(defaults) as (keyof T)[])
      const next = { ...latest.current }
      for (const key of targets) next[key] = structuredClone(defaults[key])
      latest.current = next
      setValues(next)
      setErrors({})
    },
    [defaults],
  )

  const submit = useCallback((method: string, url: string, options: FormOptions = {}): void => {
    setProcessing(true)
    setErrors({})
    const payload = transformer.current ? transformer.current(latest.current) : latest.current
    void visitApi(url, {
      ...options,
      method,
      data: payload,
      onError: (failed) => {
        setErrors(failed)
        options.onError?.(failed)
      },
      onFinish: () => {
        setProcessing(false)
        options.onFinish?.()
      },
    })
  }, [])

  return useMemo(
    () =>
      ({
        ...values,
        processing,
        errors,
        data: () => latest.current,
        setData,
        clearErrors,
        reset,
        transform: (callback: (data: T) => Record<string, unknown>) => {
          transformer.current = callback
        },
        post: (url: string, options?: FormOptions) => submit("POST", url, options),
        patch: (url: string, options?: FormOptions) => submit("PATCH", url, options),
        delete: (url: string, options?: FormOptions) => submit("DELETE", url, options),
      }) as ApiForm<T>,
    [values, processing, errors, setData, clearErrors, reset, submit],
  )
}

export const apiRouter = {
  post: (url: string, data: Record<string, unknown>, options?: FormOptions) => void visitApi(url, { ...options, method: "POST", data }),
  patch: (url: string, data: Record<string, unknown>, options?: FormOptions) => void visitApi(url, { ...options, method: "PATCH", data }),
  delete: (url: string, options?: FormOptions & { data?: Record<string, unknown> }) =>
    void visitApi(url, { ...options, method: "DELETE", data: options?.data ?? {} }),
  visit: (url: string | URL, options: ApiVisitOptions = {}) => void visitApi(String(url), options),
  reload: (options?: { only?: string[] }) => {
    void options
    window.dispatchEvent(new CustomEvent("silabos:reload"))
  },
  on: (event: "before", listener: (event: BeforeVisitEvent) => void) => {
    if (event !== "before") return () => undefined
    beforeVisitListeners.add(listener)

    return () => {
      beforeVisitListeners.delete(listener)
    }
  },
}
