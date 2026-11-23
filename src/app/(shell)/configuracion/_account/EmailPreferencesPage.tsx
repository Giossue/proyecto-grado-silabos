"use client"

import { CalendarClock, Mail, Save } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { ApiError } from "@/api/client"
import { getEmailPreferences, updateEmailPreferences, type EmailNoticeOption } from "@/api/emailPreferences"
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
import { toast } from "@/lib/toast"
import { useSession } from "@/state/session"

const ROWS_BY_ROLE: Record<string, number> = { docente: 6, coordinador: 2, bibliotecario: 4 }

const chosenFrom = (options: EmailNoticeOption[]): Record<string, boolean> => Object.fromEntries(options.map((option) => [option.type, option.enabled]))

export default function EmailPreferencesPage() {
  const role = useSession().session?.active_role?.code ?? ""
  const optionRows = ROWS_BY_ROLE[role] ?? 4
  const [options, setOptions] = useState<EmailNoticeOption[] | null>(null)
  const [chosen, setChosen] = useState<Record<string, boolean>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [openSection, setOpenSection] = useState("resumen")

  const fill = (value: EmailNoticeOption[]): void => {
    setOptions(value)
    setChosen(chosenFrom(value))
  }

  const fetchPreferences = useCallback(
    (): Promise<void> =>
      getEmailPreferences().then(
        (result) => {
          setOptions(result.options)
          setChosen(chosenFrom(result.options))
        },
        (reason: unknown) => setLoadError(reason instanceof ApiError ? reason.message : "No se pudieron cargar sus avisos por correo"),
      ),
    [],
  )

  useEffect(() => {
    void fetchPreferences()
  }, [fetchPreferences])

  const load = (): void => {
    setLoadError(null)
    void fetchPreferences()
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

  const save = async (): Promise<void> => {
    setSaving(true)
    setSaveError(null)
    try {
      fill((await updateEmailPreferences({ ...chosen })).options)
      toast.success("Avisos por correo guardados")
    } catch (reason) {
      setSaveError(reason instanceof ApiError ? reason.message : "No se pudieron guardar sus avisos por correo")
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsLayout loading={!options && !loadError}>
      {loadError ? (
        <LoadErrorState message={loadError} onRetry={load} />
      ) : !options ? (
        <LoadingSkeleton variant="settings" settingsSection="email" rows={optionRows} />
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
                        onCheckedChange={(checked) => setChosen((current) => ({ ...current, [option.type]: checked }))}
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
              <Button type="button" disabled={saving || !dirty} onClick={() => void save()}>
                {saving ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" aria-hidden="true" />}
                Guardar
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </SettingsLayout>
  )
}
