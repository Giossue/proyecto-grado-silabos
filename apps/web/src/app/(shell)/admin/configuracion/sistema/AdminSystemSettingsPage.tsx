"use client"

import { Bell, GraduationCap, Library, PlugZap, Save } from "lucide-react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { ApiError } from "@/api/client"
import { testSystemConnection, updateSystemSettings, type SettingsSection, type SystemSettings } from "@/api/systemSettings"
import { PasswordConfirmDialog } from "@/components/PasswordConfirmDialog"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { SettingsAccordionSection } from "@/components/domain/SettingsAccordionSection"
import { Accordion } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { SettingsLayout } from "@/layouts/settings/Layout"
import { toast } from "@/lib/toast"
import { queryErrorMessage } from "@/lib/queryClient"
import { configurationKeys, systemSettingsQuery } from "@/queries/configuration"

type NotificationsForm = { emails: boolean; digest_time: string }
type LibraryForm = { driver: string; base_url: string }
type TeacherAssistantForm = { enabled: boolean }
type Forms = { notifications: NotificationsForm; library: LibraryForm; teacherAssistant: TeacherAssistantForm }
type Snapshot = { notifications: string; library: string; teacherAssistant: string }

const EMPTY_SNAPSHOT: Snapshot = { notifications: "", library: "", teacherAssistant: "" }

const formsFrom = (value: SystemSettings): Forms => ({
  notifications: {
    emails: value.notifications.emails.value ?? true,
    digest_time: value.notifications.digest_time.value ?? "08:00",
  },
  library: { driver: value.library.driver.value ?? "disabled", base_url: value.library.base_url.value ?? "" },
  teacherAssistant: { enabled: value.teacher_assistant.enabled.value === true },
})

const snapshot = ({ notifications, library, teacherAssistant }: Forms): Snapshot => ({
  notifications: JSON.stringify(notifications),
  library: JSON.stringify(library),
  teacherAssistant: JSON.stringify(teacherAssistant),
})

const DEFAULT_CONFIRM_DESCRIPTION = "Por seguridad, confirme su contraseña actual para guardar"

export default function AdminSystemSettingsPage() {
  const queryClient = useQueryClient()
  const query = useQuery(systemSettingsQuery())
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const loadError = queryErrorMessage(query, "No se pudo cargar la configuración del sistema")
  const [saving, setSaving] = useState<SettingsSection | null>(null)
  const [testing, setTesting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [requestError, setRequestError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [openSection, setOpenSection] = useState("notificaciones")
  const [notifications, setNotifications] = useState<NotificationsForm>({ emails: true, digest_time: "08:00" })
  const [library, setLibrary] = useState<LibraryForm>({ driver: "disabled", base_url: "" })
  const [teacherAssistant, setTeacherAssistant] = useState<TeacherAssistantForm>({ enabled: false })
  const [baseline, setBaseline] = useState<Snapshot>(EMPTY_SNAPSHOT)

  if (query.data && query.data !== settings) {
    const forms = formsFrom(query.data)
    setSettings(query.data)
    setNotifications(forms.notifications)
    setLibrary(forms.library)
    setTeacherAssistant(forms.teacherAssistant)
    setBaseline(snapshot(forms))
  }

  const load = (): void => {
    void query.refetch()
  }

  const current = snapshot({ notifications, library, teacherAssistant })
  const dirty = {
    notificaciones: current.notifications !== baseline.notifications,
    biblioteca: current.library !== baseline.library,
    "asistente-docente": current.teacherAssistant !== baseline.teacherAssistant,
  }

  const save = async (section: SettingsSection, currentPassword?: string): Promise<void> => {
    setSaving(section)
    setErrors({})
    setRequestError(null)
    const body: Record<string, unknown> =
      section === "notificaciones" ? { ...notifications } : section === "asistente-docente" ? { ...teacherAssistant } : { ...library, current_password: currentPassword }
    try {
      queryClient.setQueryData(configurationKeys.systemSettings(), await updateSystemSettings(section, body))
      setConfirming(false)
      toast.success("Ajustes guardados")
    } catch (reason) {
      if (reason instanceof ApiError) {
        const failed: Record<string, string> = Object.fromEntries(Object.entries(reason.errors).map(([key, values]) => [key, values[0] ?? reason.message]))
        setErrors(failed)
        if (Object.keys(failed).length === 0) setRequestError(reason.message)
        if (!failed.current_password) setConfirming(false)
      } else {
        setRequestError("No se pudieron guardar los ajustes")
        setConfirming(false)
      }
    } finally {
      setSaving(null)
    }
  }

  const openConfirm = (): void => {
    setErrors((previous) => Object.fromEntries(Object.entries(previous).filter(([key]) => key !== "current_password")))
    setConfirming(true)
  }

  const test = async (): Promise<void> => {
    setTesting(true)
    try {
      const result = await testSystemConnection("biblioteca")
      if (result.ok) toast.success(result.message)
      else toast.error(result.message)
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "No se pudo probar la conexión")
    } finally {
      setTesting(false)
    }
  }

  const saveIcon = (section: SettingsSection) =>
    saving === section ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" aria-hidden="true" />

  const testButton = (
    <Button type="button" variant="outline" disabled={testing} onClick={() => void test()}>
      {testing ? <Spinner data-icon="inline-start" /> : <PlugZap data-icon="inline-start" aria-hidden="true" />}
      Probar conexión
    </Button>
  )

  return (
    <SettingsLayout loading={!settings && !loadError}>
      {loadError ? (
        <LoadErrorState message={loadError} onRetry={load} />
      ) : !settings ? (
        <LoadingSkeleton variant="settings" settingsSection="system" />
      ) : (
        <>
          {requestError ? <FeedbackAlert message={requestError} /> : null}

          <Accordion type="single" collapsible value={openSection} onValueChange={setOpenSection} className="-mt-2">
            <SettingsAccordionSection
              value="notificaciones"
              data-tour="settings-notices"
              title="Notificaciones"
              description="Resumen diario de pendientes, de lunes a viernes"
              icon={Bell}
            >
              <Field orientation="horizontal">
                <Switch id="settings-emails" checked={notifications.emails} onCheckedChange={(emails) => setNotifications((previous) => ({ ...previous, emails }))} />
                <FieldLabel htmlFor="settings-emails" className="font-normal">
                  Enviar el resumen diario por correo
                </FieldLabel>
              </Field>
              <Field data-invalid={Boolean(errors.digest_time)}>
                <FieldLabel htmlFor="settings-digest-time" required>
                  Hora del resumen
                </FieldLabel>
                <Input
                  id="settings-digest-time"
                  value={notifications.digest_time}
                  onChange={(event) => setNotifications((previous) => ({ ...previous, digest_time: event.target.value }))}
                  type="time"
                  className="w-32"
                  aria-required="true"
                />
                {errors.digest_time ? <FieldError errors={[errors.digest_time]} /> : null}
              </Field>
              <div>
                <Button type="button" disabled={saving !== null || !dirty.notificaciones} onClick={() => void save("notificaciones")}>
                  {saveIcon("notificaciones")}
                  Guardar
                </Button>
              </div>
            </SettingsAccordionSection>

            <SettingsAccordionSection
              value="asistente-docente"
              data-tour="settings-teacher-ai"
              title="Asistente del docente"
              description="Ayuda con IA dentro del sílabo del docente"
              icon={GraduationCap}
            >
              <Field orientation="horizontal">
                <Switch
                  id="settings-teacher-assistant"
                  checked={teacherAssistant.enabled}
                  onCheckedChange={(enabled) => setTeacherAssistant({ enabled })}
                  aria-describedby="settings-teacher-assistant-help"
                />
                <FieldContent>
                  <FieldLabel htmlFor="settings-teacher-assistant" className="font-normal">
                    Activar el asistente del docente
                  </FieldLabel>
                  <FieldDescription id="settings-teacher-assistant-help">
                    Apagado, el docente no ve el asistente. No cambia el asistente de la plantilla. Lo que la IA puede leer se elige campo por campo en la plantilla del sílabo
                  </FieldDescription>
                </FieldContent>
              </Field>
              <div>
                <Button type="button" disabled={saving !== null || !dirty["asistente-docente"]} onClick={() => void save("asistente-docente")}>
                  {saveIcon("asistente-docente")}
                  Guardar
                </Button>
              </div>
            </SettingsAccordionSection>

            <SettingsAccordionSection
              value="biblioteca"
              data-tour="settings-library"
              title="Biblioteca (Koha)"
              description="Catálogo donde los docentes buscan los libros de la bibliografía"
              icon={Library}
            >
              <Field>
                <FieldLabel htmlFor="settings-library-driver" required>
                  Búsqueda en el catálogo
                </FieldLabel>
                <Select value={library.driver} onValueChange={(driver) => setLibrary((previous) => ({ ...previous, driver }))}>
                  <SelectTrigger id="settings-library-driver">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="disabled">Desactivada</SelectItem>
                      <SelectItem value="koha">Koha</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              {library.driver === "koha" ? (
                <Field data-invalid={Boolean(errors.base_url)}>
                  <FieldLabel htmlFor="settings-library-url" required>
                    Dirección del catálogo
                  </FieldLabel>
                  <Input
                    id="settings-library-url"
                    value={library.base_url}
                    onChange={(event) => setLibrary((previous) => ({ ...previous, base_url: event.target.value }))}
                    placeholder="Ej. http://biblioteca.ueb.edu.ec"
                    autoComplete="off"
                    aria-required="true"
                  />
                </Field>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={saving !== null || !dirty.biblioteca} onClick={openConfirm}>
                  {saveIcon("biblioteca")}
                  Guardar
                </Button>
                {testButton}
              </div>
            </SettingsAccordionSection>
          </Accordion>
        </>
      )}

      <PasswordConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Guardar la biblioteca"
        description={errors.current_password ?? DEFAULT_CONFIRM_DESCRIPTION}
        confirmLabel="Guardar"
        onConfirm={(password) => void save("biblioteca", password)}
      />
    </SettingsLayout>
  )
}
