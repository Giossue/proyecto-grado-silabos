"use client"

import { useEffect, useRef, useState } from "react"
import { FileDropzone } from "@/components/domain/FileDropzone"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { loadLogo, prepareLogo, type LoadedLogo, type PrepareOptions } from "@/lib/logoPrepare"

type FacultyLogoFieldProps = {
  inputId: string
  value: File | null
  onValueChange: (file: File | null) => void
  onValidationError?: (message: string | null) => void
  disabled?: boolean
  invalid?: boolean
  required?: boolean
}

export function FacultyLogoField({ inputId, value, onValueChange, onValidationError, disabled, invalid, required }: FacultyLogoFieldProps) {
  const [source, setSource] = useState<File | null>(null)
  const [loaded, setLoaded] = useState<LoadedLogo | null>(null)
  const [removeWhite, setRemoveWhite] = useState(true)
  const [tolerance, setTolerance] = useState(18)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [previousValue, setPreviousValue] = useState(value)
  const run = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const preview = useRef<string | null>(null)

  if (value !== previousValue) {
    setPreviousValue(value)
    if (value === null && source !== null && loaded === null) setSource(null)
  }

  const showPreview = (url: string | null): void => {
    if (preview.current !== null) URL.revokeObjectURL(preview.current)
    preview.current = url
    setPreviewUrl(url)
  }

  useEffect(
    () => () => {
      clearTimeout(timer.current)
      if (preview.current !== null) URL.revokeObjectURL(preview.current)
    },
    [],
  )

  const prepare = async (logo: LoadedLogo, options: PrepareOptions): Promise<void> => {
    const turn = ++run.current
    try {
      const file = await prepareLogo(logo, options)
      if (turn !== run.current) return
      showPreview(URL.createObjectURL(file))
      setMessage(null)
      onValueChange(file)
    } catch (reason) {
      if (turn !== run.current) return
      setMessage(reason instanceof Error ? reason.message : "No se pudo preparar la imagen")
      onValueChange(null)
    }
  }

  const pick = async (file: File | null): Promise<void> => {
    setSource(file)
    run.current += 1
    clearTimeout(timer.current)
    setLoaded(null)
    setMessage(null)
    showPreview(null)
    if (file === null) {
      onValueChange(null)
      return
    }
    let logo: LoadedLogo
    try {
      logo = await loadLogo(file)
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "No se pudo leer la imagen")
      onValueChange(null)
      return
    }
    const white = !logo.transparent
    setLoaded(logo)
    setRemoveWhite(white)
    await prepare(logo, { removeWhite: white, tolerance })
  }

  const schedule = (options: PrepareOptions): void => {
    clearTimeout(timer.current)
    if (loaded === null) return
    timer.current = setTimeout(() => void prepare(loaded, options), 120)
  }

  const changeRemoveWhite = (checked: boolean): void => {
    setRemoveWhite(checked)
    schedule({ removeWhite: checked, tolerance })
  }

  const changeTolerance = (next: number[]): void => {
    const level = next[0]
    if (level === undefined) return
    setTolerance(level)
    schedule({ removeWhite, tolerance: level })
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <FileDropzone
        value={source}
        onValueChange={(file) => void pick(file)}
        inputId={inputId}
        kind="image"
        maxBytes={10 * 1024 * 1024}
        disabled={disabled}
        invalid={invalid || message !== null}
        required={required && value === null}
        onValidationError={onValidationError}
      />
      {message ? (
        <p className="text-sm text-destructive" role="alert">
          {message}
        </p>
      ) : null}
      {previewUrl && source ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <figure className="flex flex-col gap-1">
              <div className="flex h-20 items-center justify-center rounded-md border bg-[var(--document-paper)] p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="Así se verá el logo en el documento" className="h-12 w-auto max-w-full object-contain" />
              </div>
              <figcaption className="text-xs text-muted-foreground">Así se verá en el documento</figcaption>
            </figure>
            <figure className="flex flex-col gap-1">
              <div className="flex h-20 items-center justify-center rounded-md border p-2 [background:repeating-conic-gradient(var(--color-muted)_0%_25%,var(--color-card)_0%_50%)_50%/16px_16px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="Logo con su fondo transparente" className="h-12 w-auto max-w-full object-contain" />
              </div>
              <figcaption className="text-xs text-muted-foreground">Lo cuadriculado es transparente</figcaption>
            </figure>
          </div>
          <div className="flex flex-col gap-2 rounded-md border bg-field p-3">
            <label className="flex items-center justify-between gap-3 text-sm font-medium" htmlFor={`${inputId}-white`}>
              Quitar el fondo blanco
              <Switch id={`${inputId}-white`} checked={removeWhite} disabled={disabled} onCheckedChange={changeRemoveWhite} />
            </label>
            {removeWhite ? (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span id={`${inputId}-strength`} className="shrink-0">
                  Intensidad
                </span>
                <Slider value={[tolerance]} min={0} max={80} step={1} disabled={disabled} aria-labelledby={`${inputId}-strength`} onValueChange={changeTolerance} />
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
