"use client"

import { Download, FileSearch, FileSpreadsheet, Upload } from "lucide-react"
import { useState } from "react"
import { ApiError } from "@/api/client"
import { downloadImportTemplate, sendImport, type ImportKind, type ImportResult, type ImportRow } from "@/api/spreadsheet-import"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { FileDropzone } from "@/components/domain/FileDropzone"
import { TablePagination } from "@/components/domain/TablePagination"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useClientPagination } from "@/composables/useClientPagination"
import { cn } from "@/lib/utils"

type ImportSpreadsheetDialogProps = {
  title: string
  kind: ImportKind
  templateName: string
  columns: { key: string; label: string }[]
  extra?: Record<string, string>
  onImported?: (message: string) => void
}

const NO_ROWS: ImportRow[] = []

export function ImportSpreadsheetDialog({ title, kind, templateName, columns, extra, onImported }: ImportSpreadsheetDialogProps) {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { items: pagedRows, meta, setPage } = useClientPagination(result?.rows ?? NO_ROWS, 20, result)
  const failedRows = result?.rows.filter((row) => row.errors.length > 0).length ?? 0

  const changeOpen = (value: boolean): void => {
    if (value) {
      setFile(null)
      setResult(null)
      setError(null)
    }
    setOpen(value)
  }

  const run = async (confirm: boolean): Promise<void> => {
    if (!file) return
    setProcessing(true)
    setError(null)
    try {
      const next = await sendImport(kind, file, confirm, extra)
      setResult(next)
      if (confirm && next.valid) {
        setOpen(false)
        onImported?.(`${next.created} registros importados`)
      }
    } catch (reason) {
      setResult(null)
      setError(reason instanceof ApiError ? (Object.values(reason.errors).flat()[0] ?? reason.message) : "No se pudo procesar el archivo")
    } finally {
      setProcessing(false)
    }
  }

  const chooseFile = (value: File | null): void => {
    setFile(value)
    setResult(null)
  }

  const download = async (): Promise<void> => {
    try {
      await downloadImportTemplate(kind, templateName)
    } catch {
      setError("No se pudo descargar la plantilla")
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="success">
          <FileSpreadsheet data-icon="inline-start" aria-hidden="true" />
          Importar desde Excel
        </Button>
      </DialogTrigger>
      <DialogContent className={cn("flex max-h-screen flex-col gap-0 overflow-hidden p-0", result ? "sm:max-w-3xl" : "sm:max-w-md")}>
        <ScrollArea className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]]:max-h-[calc(100dvh-2rem)]">
          <div className="grid gap-4 p-6">
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>Registre varios a la vez con la plantilla de Excel</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 text-sm">
                <p>1. Descargue la plantilla y complete una fila por registro</p>
                <Button type="button" variant="outline" className="w-fit" onClick={() => void download()}>
                  <Download data-icon="inline-start" aria-hidden="true" />
                  Descargar plantilla
                </Button>
                <p>2. Suba el archivo .xlsx y revise el resultado antes de importar</p>
                <FileDropzone
                  value={file}
                  onValueChange={chooseFile}
                  onValidationError={setError}
                  inputId="import-spreadsheet-file"
                  kind="xlsx"
                  maxBytes={2 * 1024 * 1024}
                  disabled={processing}
                  invalid={Boolean(error)}
                />
              </div>
              {error ? <FeedbackAlert message={error} /> : null}
              {result ? (
                <>
                  {result.valid ? (
                    <p className="text-sm">Todas las filas son válidas ({result.rows.length}). Confirme para importarlas</p>
                  ) : (
                    <p className="text-sm text-destructive">{failedRows} fila(s) con errores. Corrija el archivo y vuelva a subirlo; no se importó nada</p>
                  )}
                  <Table label="Vista previa de la importación">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fila</TableHead>
                        {columns.map((column) => (
                          <TableHead key={column.key}>{column.label}</TableHead>
                        ))}
                        <TableHead>Resultado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedRows.map((row) => (
                        <TableRow key={row.line}>
                          <TableCell>{row.line}</TableCell>
                          {columns.map((column) => (
                            <TableCell key={column.key}>{row.values[column.key]}</TableCell>
                          ))}
                          <TableCell className={row.errors.length ? "text-destructive" : "text-muted-foreground"}>{row.errors.length ? row.errors.join(" ") : "Válida"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePagination meta={meta} label="Paginación de la vista previa" onPageChange={setPage} />
                </>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" disabled={processing} onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                {result?.valid ? (
                  <Button type="button" variant="success" disabled={processing} onClick={() => void run(true)}>
                    {processing ? <Spinner data-icon="inline-start" /> : <Upload data-icon="inline-start" aria-hidden="true" />}
                    Importar
                  </Button>
                ) : (
                  <Button type="button" disabled={!file || processing} onClick={() => void run(false)}>
                    {processing ? <Spinner data-icon="inline-start" /> : <FileSearch data-icon="inline-start" aria-hidden="true" />}
                    Revisar
                  </Button>
                )}
              </DialogFooter>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
