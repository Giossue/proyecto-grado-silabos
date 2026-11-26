"use client"

import { CalendarClock, Mail, Save } from "lucide-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { updateEmailPreferences, type EmailNoticeOption } from "@/api/emailPreferences"
import { EmptyState } from "@/components/domain/EmptyState"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { SettingsAccordionSection } from "@/components/domain/SettingsAccordionSection"
import { Accordion } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { SettingsLayout } from "@/layouts/settings/Layout"
import { errorMessage, queryErrorMessage } from "@/lib/queryClient"
import { toast } from "@/lib/toast"
import { accountKeys, emailPreferencesQuery } from "@/queries/account"


const chosenFrom = (options: EmailNoticeOption[]): Record<string, boolean> => Object.fromEntries(options.map((option) => [option.type, option.enabled]))

export default function EmailPreferencesPage() {
  const queryClient = useQueryClient()
  const query = useQuery(emailPreferencesQuery())
  const options = query.data?.options ?? null
  const [edited, setEdited] = useState<Record<string, boolean> | null>(null)
  const chosen = edited ?? chosenFrom(options ?? [])
  const loadError = queryErrorMessage(query, "No se pudieron cargar sus avisos por correo")
  const [openSection, setOpenSection] = useState("resumen")
  const saving = useMutation({
    mutationFn: (preferences: Record<string, boolean>) => updateEmailPreferences(preferences),
    onSuccess: (result) => {
      queryClient.setQueryData(accountKeys.emailPreferences(), result)
      setEdited(null)
      toast.success("Avisos por correo guardados")
    },
  })
  const saveError = saving.isError ? errorMessage(saving.error, "No se pudieron guardar sus avisos por correo") : null

  const load = (): void => {
    void query.refetch()
  }

  const all = options ?? []
  const groups = [
    {
      value: "resumen",
      title: "Resumen diario",
      description: "Un correo de lunes a viernes, solo si tiene pendientes",
      icon: CalendarClock,
      options: all.filter((option) => option.type.endsWith(".resumen_diario")),
    },
    {
      value: "avisos",
      title: "Avisos por correo",
      description: "Elija qué avisos recibe también en su correo",
      icon: Mail,
      options: all.filter((option) => !option.type.endsWith(".resumen_diario")),
    },
  ].filter((group) => group.options.length > 0)
  const dirty = all.some((option) => chosen[option.type] !== option.enabled)

  const save = (): void => {
    saving.mutate({ ...chosen })
  }

  return (
    <SettingsLayout loading={!options && !loadError}>
      {loadError ? (
        <LoadErrorState message={loadError} onRetry={load} />
      ) : !options ? (
        <LoadingSkeleton variant="settings" settingsSection="email" rows={1} />
      ) : (
        <div data-tour="email-notices" className="flex flex-col gap-6">
          {saveError ? <FeedbackAlert message={saveError} /> : null}
          {options.length === 0 ? (
            <EmptyState title="Su rol no recibe avisos por correo" />
          ) : (
            <Accordion type="single" collapsible value={openSection} onValueChange={setOpenSection} className="-mt-2">
              {groups.map((group) => (
                <SettingsAccordionSection key={group.value} value={group.value} title={group.title} description={group.description} icon={group.icon} keepMounted>
                  {group.options.map((option) => (
                    <Field key={option.type} orientation="horizontal">
                      <Switch
                        id={`email-notice-${option.type}`}
                        checked={chosen[option.type] ?? false}
                        onCheckedChange={(checked) => setEdited({ ...chosen, [option.type]: checked })}
                      />
                      <FieldContent>
                        <FieldLabel htmlFor={`email-notice-${option.type}`}>{option.label}</FieldLabel>
                        <FieldDescription>{option.description}</FieldDescription>
                      </FieldContent>
                    </Field>
                  ))}
                </SettingsAccordionSection>
              ))}
            </Accordion>
          )}
          {options.length ? (
            <div>
              <Button type="button" disabled={saving.isPending || !dirty} onClick={save}>
                {saving.isPending ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" aria-hidden="true" />}
                Guardar
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </SettingsLayout>
  )
}
