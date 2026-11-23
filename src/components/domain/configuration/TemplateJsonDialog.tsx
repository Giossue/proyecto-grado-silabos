"use client"

import { Download, FileUp, Save } from "lucide-react"
import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { ApiError } from "@/api/client"
import { getTemplateJson, importTemplateJson } from "@/api/template"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { useOpened } from "@/composables/useModelOpen"
import { downloadJson } from "@/lib/downloadJson"

type TemplateJsonDialogProps = {
  templateId: string
  locked: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported?: () => void
}

export function TemplateJsonDialog({ templateId, locked, open, onOpenChange, onImported }: TemplateJsonDialogProps) {
  const [text, setText] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [problems, setProblems] = useState<string[]>([])
  const [failure, setFailure] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const canApply = !locked && !loading && !saving && text.trim() !== ""

  useOpened(open, () => {
    setLoading(true)
    setFailure(null)
    setProblems([])
  }, true)

  useEffect(() => {
    if (!open) return
    let current = true
    getTemplateJson(templateId)
      .then((json) => {
        if (current) setText(JSON.stringify(json, null, 2))
      })
      .catch((reason: unknown) => {
        if (current) setFailure(reason instanceof ApiError ? reason.message : "No se pudo leer la plantilla")
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => {
      current = false
    }
  }, [open, templateId])

  const apply = async (): Promise<void> => {
    setFailure(null)
    setProblems([])
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (reason) {
      setFailure(`El JSON no es válido: ${reason instanceof Error ? reason.message : "error de sintaxis"}`)
      return
    }
    setSaving(true)
    try {
      await importTemplateJson(templateId, parsed)
      onOpenChange(false)
      onImported?.()
    } catch (reason) {
      if (reason instanceof ApiError) {
        const found = Object.entries(reason.errors).flatMap(([path, messages]) => messages.map((message) => `${path}: ${message}`))
        setProblems(found)
        setFailure(found.length === 0 ? reason.message : "La plantilla tiene errores y no se cambió nada")
      } else {
        setFailure("No se pudo importar la plantilla")
      }
    } finally {
      setSaving(false)
    }
  }

  const readFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    setText(await file.text())
    setProblems([])
    setFailure(null)
    input.value = ""
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Plantilla como JSON</DialogTitle>
          <DialogDescription>Descargue la plantilla o cargue una desde un archivo</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={loading || text.trim() === ""} onClick={() => downloadJson(text, "plantilla-silabo.json")}>
            <Download data-icon="inline-start" aria-hidden="true" />
            Descargar
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={locked || loading} onClick={() => fileInput.current?.click()}>
            <FileUp data-icon="inline-start" aria-hidden="true" />
            Cargar archivo
          </Button>
          <Input ref={fileInput} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-label="Archivo JSON de la plantilla" onChange={(event) => void readFile(event)} />
          {loading ? (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              Cargando…
            </span>
          ) : null}
        </div>
        <Textarea value={text} spellCheck={false} disabled={locked || loading} aria-label="JSON de la plantilla" className="h-96 font-mono text-xs" onChange={(event) => setText(event.target.value)} />
        {failure ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              {failure}
              {problems.length ? (
                <ScrollArea className="mt-2 [&>[data-slot=scroll-area-viewport]]:max-h-40">
                  <ul className="list-disc pl-5 font-mono text-xs">
                    {problems.map((problem) => <li key={problem}>{problem}</li>)}
                  </ul>
                </ScrollArea>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" disabled={!canApply} onClick={() => void apply()}>
            {saving ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" aria-hidden="true" />}
            Aplicar y reemplazar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
