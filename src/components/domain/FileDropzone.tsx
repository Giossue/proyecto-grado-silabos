"use client"

import { FileText, ImageIcon, Upload, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { Attachment, AttachmentAction, AttachmentActions, AttachmentContent, AttachmentDescription, AttachmentMedia, AttachmentTitle } from "@/components/ui/attachment"
import { Button } from "@/components/ui/button"

export type FileKind = "pdf" | "png" | "image" | "xlsx" | "document" | "certificate"

type FileDropzoneProps = {
  value: File | null
  onValueChange?: (file: File | null) => void
  onValidationError?: (message: string | null) => void
  onFilesSelected?: (files: File[]) => void
  inputId: string
  disabled?: boolean
  invalid?: boolean
  required?: boolean
  maxBytes?: number
  kind?: FileKind
  multiple?: boolean
  state?: "idle" | "uploading" | "processing" | "error" | "done"
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const formatLimit = (bytes: number): string => {
  const megabytes = bytes / (1024 * 1024)
  return Number.isInteger(megabytes) ? `${megabytes} MB` : formatBytes(bytes)
}

const copyFor = (kind: FileKind, maxBytes: number) => {
  if (kind === "document") {
    return {
      accept:
        ".pdf,.doc,.docx,.xlsx,.xls,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel",
      label: "Documento",
      invalid: "Seleccione un PDF, Word o Excel",
      maxError: `Cada archivo puede pesar hasta ${formatLimit(maxBytes)}`,
      emptyTitle: "Arrastre su PDF, Word o Excel aquí",
      chooseLabel: "Cargar documento PDF, Word o Excel",
      removeLabel: "Quitar documento",
      dropAnnouncement: "Suelte los documentos para adjuntarlos",
    }
  }
  if (kind === "certificate") {
    return {
      accept: ".p12,.pfx,application/x-pkcs12",
      label: "Firma",
      invalid: "Seleccione un archivo de firma (.p12 o .pfx)",
      maxError: `El archivo no puede superar los ${formatLimit(maxBytes)}`,
      emptyTitle: "Arrastre su archivo de firma aquí",
      chooseLabel: "Cargar archivo de firma",
      removeLabel: "Quitar archivo de firma",
      dropAnnouncement: "Suelte el archivo de firma para seleccionarlo",
    }
  }
  if (kind === "xlsx") {
    return {
      accept: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      label: "Excel",
      invalid: "Seleccione un archivo Excel (.xlsx)",
      maxError: `El archivo no puede superar los ${formatLimit(maxBytes)}`,
      emptyTitle: "Arrastre su Excel aquí",
      chooseLabel: "Cargar archivo Excel",
      removeLabel: "Quitar Excel",
      dropAnnouncement: "Suelte el Excel para seleccionarlo",
    }
  }
  if (kind === "image") {
    return {
      accept: "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp",
      label: "Imagen",
      invalid: "Seleccione una imagen PNG, JPG o WebP",
      maxError: `La imagen no puede superar los ${formatLimit(maxBytes)}`,
      emptyTitle: "Arrastre su imagen aquí",
      chooseLabel: "Cargar imagen",
      removeLabel: "Quitar imagen",
      dropAnnouncement: "Suelte la imagen para seleccionarla",
    }
  }
  if (kind === "png") {
    return {
      accept: "image/png,.png",
      label: "PNG",
      invalid: "Seleccione un archivo PNG",
      maxError: `El PNG no puede superar los ${formatLimit(maxBytes)}`,
      emptyTitle: "Arrastre su PNG aquí",
      chooseLabel: "Cargar archivo PNG",
      removeLabel: "Quitar PNG",
      dropAnnouncement: "Suelte el PNG para seleccionarlo",
    }
  }
  return {
    accept: "application/pdf,.pdf",
    label: "PDF",
    invalid: "Seleccione un archivo PDF",
    maxError: `El PDF no puede superar los ${formatLimit(maxBytes)}`,
    emptyTitle: "Arrastre su PDF aquí",
    chooseLabel: "Cargar archivo PDF",
    removeLabel: "Quitar PDF",
    dropAnnouncement: "Suelte el PDF para seleccionarlo",
  }
}

const isAcceptedFile = (kind: FileKind, file: File): boolean => {
  const name = file.name.toLowerCase()
  if (kind === "document") return [".pdf", ".doc", ".docx", ".xlsx", ".xls"].some((extension) => name.endsWith(extension))
  if (kind === "certificate") return [".p12", ".pfx"].some((extension) => name.endsWith(extension))
  if (kind === "image") return [".png", ".jpg", ".jpeg", ".webp"].some((extension) => name.endsWith(extension)) || ["image/png", "image/jpeg", "image/webp"].includes(file.type)
  if (kind === "png") return name.endsWith(".png") || file.type === "image/png"
  if (kind === "xlsx") return name.endsWith(".xlsx")
  return name.endsWith(".pdf") || file.type === "application/pdf"
}

export function FileDropzone({
  value,
  onValueChange,
  onValidationError,
  onFilesSelected,
  inputId,
  disabled = false,
  invalid = false,
  required = false,
  maxBytes = 50 * 1024 * 1024,
  kind = "pdf",
  multiple = false,
  state = "idle",
}: FileDropzoneProps) {
  const input = useRef<HTMLInputElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const focusTarget = useRef<"remove" | "dropzone" | null>(null)
  const [dragDepth, setDragDepth] = useState(0)
  const isDragging = dragDepth > 0
  const copy = copyFor(kind, maxBytes)
  const showsImage = kind === "png" || kind === "image"
  const previewUrl = useMemo(
    () => (value !== null && showsImage && typeof URL.createObjectURL === "function" ? URL.createObjectURL(value) : null),
    [value, showsImage],
  )

  useEffect(() => {
    if (previewUrl === null) return
    return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  useEffect(() => {
    if (value === null && input.current) input.current.value = ""
    const target = focusTarget.current
    focusTarget.current = null
    if (target === "remove") root.current?.querySelector<HTMLButtonElement>("[data-file-remove]")?.focus()
    if (target === "dropzone") root.current?.querySelector<HTMLButtonElement>("[data-file-dropzone]")?.focus()
  }, [value])

  const chooseFile = (): void => {
    if (!disabled) input.current?.click()
  }

  const isValidFile = (file: File): boolean => {
    const accepted = isAcceptedFile(kind, file)
    if (!accepted || file.size > maxBytes) {
      onValidationError?.(!accepted ? copy.invalid : copy.maxError)
      return false
    }
    return true
  }

  const setFile = (file: File | null): void => {
    if (!file) {
      onValueChange?.(null)
      onValidationError?.(null)
      return
    }
    if (!isValidFile(file)) {
      onValueChange?.(null)
      return
    }
    focusTarget.current = "remove"
    onValueChange?.(file)
    onValidationError?.(null)
  }

  const setFiles = (files: File[]): void => {
    if (!multiple) {
      setFile(files[0] ?? null)
      return
    }
    if (!files.length || !files.every(isValidFile)) return
    onValidationError?.(null)
    onFilesSelected?.(files)
    if (input.current) input.current.value = ""
  }

  const selectFile = (event: ChangeEvent<HTMLInputElement>): void => setFiles(Array.from(event.target.files ?? []))

  const clearFile = (): void => {
    if (disabled) return
    focusTarget.current = "dropzone"
    setFile(null)
  }

  const handleDragEnter = (event: DragEvent): void => {
    event.preventDefault()
    if (!disabled) setDragDepth((depth) => depth + 1)
  }

  const handleDragLeave = (event: DragEvent): void => {
    event.preventDefault()
    setDragDepth((depth) => Math.max(0, depth - 1))
  }

  const handleDrop = (event: DragEvent): void => {
    if (disabled) return
    event.preventDefault()
    setDragDepth(0)
    setFiles(Array.from(event.dataTransfer?.files ?? []))
  }

  return (
    <>
      <div ref={root} className="flex flex-col gap-2">
        {!value || multiple ? (
          <Button
            type="button"
            variant="dropzone"
            size="dropzone"
            data-file-dropzone
            data-dragging={isDragging}
            aria-invalid={invalid}
            disabled={disabled}
            aria-label={copy.chooseLabel}
            onClick={chooseFile}
            onDragEnter={handleDragEnter}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center gap-2 text-center">
              <Upload className="size-8 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="font-medium">{copy.emptyTitle}</p>
                <p className="text-sm text-muted-foreground">{multiple ? "o haga clic para adjuntarlos" : "o haga clic para seleccionarlo"}</p>
              </div>
            </div>
          </Button>
        ) : null}
        <input
          ref={input}
          id={inputId}
          className="sr-only"
          type="file"
          multiple={multiple}
          accept={copy.accept}
          disabled={disabled}
          required={required && !value}
          aria-invalid={invalid}
          aria-required={required}
          tabIndex={-1}
          onClick={(event) => event.stopPropagation()}
          onChange={selectFile}
        />
        {value ? (
          <Attachment className="w-full" state={invalid ? "error" : state}>
            <AttachmentMedia>
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Vista previa del PNG seleccionado" className="size-full rounded-[inherit] object-contain" />
              ) : showsImage ? (
                <ImageIcon aria-hidden="true" />
              ) : (
                <FileText aria-hidden="true" />
              )}
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>{value.name}</AttachmentTitle>
              <AttachmentDescription>{`${copy.label} · ${formatBytes(value.size)}`}</AttachmentDescription>
            </AttachmentContent>
            <AttachmentActions>
              <IconTooltip label={copy.removeLabel}>
                <AttachmentAction
                  type="button"
                  data-file-remove
                  aria-label={copy.removeLabel}
                  disabled={disabled}
                  onClick={(event) => {
                    event.stopPropagation()
                    clearFile()
                  }}
                >
                  <X aria-hidden="true" />
                </AttachmentAction>
              </IconTooltip>
            </AttachmentActions>
          </Attachment>
        ) : null}
      </div>
      {isDragging ? (
        <p className="sr-only" aria-live="polite">
          {copy.dropAnnouncement}
        </p>
      ) : null}
    </>
  )
}
