"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useId } from "react"
import { setTemplateAiPermission, type TemplateAiPermission, type TemplateField } from "@/api/template"
import { TemplateRibbonGroup } from "@/components/domain/configuration/TemplateRibbonGroup"
import { apiMessage } from "@/components/domain/configuration/templateStructure"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { failedQuery } from "@/lib/queryClient"
import { toast } from "@/lib/toast"
import { withoutFinalPeriod } from "@/lib/utils"
import { templateAiPermissionsQuery, templateKeys } from "@/queries/template"

const UNSAVED = "Guarde la plantilla para activarlo"
const NOBODY = "Nadie lo llena: la IA no lo lee"
const OUTDATED = "Recargue la página para cambiarlo"
const LOAD_FAILED = "No se pudo cargar el permiso"

type TemplateAiReadSwitchProps = {
  templateId: string
  field: TemplateField
  saved: TemplateField | null
}

function draftReason(field: TemplateField, saved: TemplateField | null): string | null {
  if (saved === null) return UNSAVED
  if (field.quien_llena === "institucional") return NOBODY
  return saved.quien_llena === "institucional" ? UNSAVED : null
}

export function TemplateAiReadSwitch({ templateId, field, saved }: TemplateAiReadSwitchProps) {
  const id = useId()
  const queryClient = useQueryClient()
  const query = useQuery(templateAiPermissionsQuery(templateId))
  const entry = saved ? query.data?.fields.find((item) => item.id === saved.id) : undefined
  const save = useMutation({
    mutationFn: ({ fieldId, readable }: { fieldId: string; readable: boolean }) => setTemplateAiPermission(templateId, fieldId, readable),
    onSuccess: (result) => {
      queryClient.setQueryData<{ fields: TemplateAiPermission[] }>(templateKeys.aiPermissions(templateId), (current) =>
        current ? { fields: current.fields.map((item) => (item.id === result.field.id ? result.field : item)) } : current,
      )
      toast.success(result.message)
    },
    onError: (reason) => {
      toast.error(apiMessage(reason, "No se pudo guardar el permiso"))
      void query.refetch()
    },
  })

  const fromDraft = draftReason(field, saved)
  const loadFailed = fromDraft === null && !query.data && failedQuery(query)
  const outdated = fromDraft === null && query.data !== undefined && !query.isFetching && !entry
  const blocked = entry?.blocked_reason ? withoutFinalPeriod(entry.blocked_reason) : null
  const reason = fromDraft ?? (loadFailed ? LOAD_FAILED : outdated ? OUTDATED : blocked)
  const waiting = save.isPending || (reason === null && !entry)

  return (
    <TemplateRibbonGroup
      label="Asistente del docente"
      note={
        reason ? (
          <span className="flex items-center gap-1.5 text-xs leading-none whitespace-nowrap text-muted-foreground">
            <span id={`${id}-reason`}>{reason}</span>
            {loadFailed ? (
              <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs leading-none" onClick={() => void query.refetch()}>
                Reintentar
              </Button>
            ) : null}
          </span>
        ) : undefined
      }
    >
      <Field orientation="horizontal" data-disabled={Boolean(reason) || waiting || undefined} className="w-auto gap-2 px-1">
        <Switch
          id={id}
          checked={reason === null && entry?.readable === true}
          disabled={reason !== null || waiting}
          aria-describedby={reason ? `${id}-reason` : undefined}
          onCheckedChange={(readable) => {
            if (entry) save.mutate({ fieldId: entry.id, readable })
          }}
        />
        <FieldLabel htmlFor={id} className="font-normal whitespace-nowrap">
          La IA puede leerlo
        </FieldLabel>
        {waiting ? <Spinner /> : null}
      </Field>
    </TemplateRibbonGroup>
  )
}
