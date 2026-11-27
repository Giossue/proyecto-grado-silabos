"use client"

import { Save } from "lucide-react"
import type { TemplateDraftImpact } from "@/api/template"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useShownWhileClosing } from "@/lib/dialogExit"

type TemplateImpactDialogProps = { impact: TemplateDraftImpact | null; onConfirm: () => void; onCancel: () => void }

const syllabi = (count: number): string => (count === 1 ? "1 sílabo" : `${count} sílabos`)

export function TemplateImpactDialog({ impact, onConfirm, onCancel }: TemplateImpactDialogProps) {
  const shown = useShownWhileClosing(impact)
  const counted = shown?.counted !== false
  const lines = !shown || !counted
    ? []
    : [
        shown.keep > 0 ? `${syllabi(shown.keep)} ${shown.keep === 1 ? "conserva" : "conservan"} lo escrito` : null,
        shown.lose > 0 ? `${syllabi(shown.lose)} ${shown.lose === 1 ? "pierde" : "pierden"} lo escrito en algún campo que cambió` : null,
        shown.back_to_draft > 0 ? `${syllabi(shown.back_to_draft)} ${shown.back_to_draft === 1 ? "enviado o aprobado vuelve" : "enviados o aprobados vuelven"} a borrador` : null,
      ].filter((line): line is string => line !== null)
  const careers = (shown?.careers.length ?? 0) > 1 ? shown!.careers : []

  return (
    <Dialog open={impact !== null} onOpenChange={(value) => { if (!value) onCancel() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sílabos afectados</DialogTitle>
          {counted ? (
            <DialogDescription>Al reanudar el proceso de sílabos en pausa:</DialogDescription>
          ) : (
            <DialogDescription data-impact-unknown>No se pudieron contar los sílabos afectados. Al reanudar un proceso de sílabos en pausa, sus sílabos conservan lo escrito en los campos que siguen igual y los enviados o aprobados vuelven a borrador</DialogDescription>
          )}
        </DialogHeader>
        {lines.length ? (
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm" data-impact-lines>
            {lines.map((line) => <li key={line}>{line}</li>)}
          </ul>
        ) : null}
        {careers.length ? (
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground" data-impact-careers>
            {careers.map((career) => <li key={career.name}>{career.name}: {syllabi(career.in_progress)}</li>)}
          </ul>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button type="button" onClick={onConfirm}>
            <Save data-icon="inline-start" aria-hidden="true" />
            {counted ? "Guardar" : "Guardar de todos modos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
