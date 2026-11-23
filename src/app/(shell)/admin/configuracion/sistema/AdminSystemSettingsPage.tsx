"use client"

import { Bell, Bot, Library, PlugZap, Save, Trash2, Undo2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { ApiError } from "@/api/client"
import { getSystemSettings, testSystemConnection, updateSystemSettings, type SettingsSection, type SystemSettings } from "@/api/systemSettings"
import { PasswordConfirmDialog } from "@/components/PasswordConfirmDialog"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { SettingsAccordionSection } from "@/components/domain/SettingsAccordionSection"
import { Accordion } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { SettingsLayout } from "@/layouts/settings/Layout"
import { useShownWhileClosing } from "@/lib/dialogExit"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"

type ConnectionSection = Exclude<SettingsSection, "notificaciones">
type NotificationsForm = { emails: boolean; digest_time: string }
type AiForm = { driver: string; base_url: string; model: string; api_key: string; clear_api_key: boolean; connect_timeout: number | string; timeout: number | string }
type LibraryForm = { driver: string; base_url: string }
type Forms = { notifications: NotificationsForm; ai: AiForm; library: LibraryForm }
type Snapshot = { notifications: string; ai: string; library: string }

const EMPTY_SNAPSHOT: Snapshot = { notifications: "", ai: "", library: "" }

const formsFrom = (value: SystemSettings): Forms => ({
  notifications: {
    emails: value.notifications.emails.value ?? true,
    digest_time: value.notifications.digest_time.value ?? "08:00",
  },
  ai: {
    driver: value.ai.driver.value ?? "disabled",
    base_url: value.ai.base_url.value ?? "",
    model: value.ai.model.value ?? "",
    api_key: "",
    clear_api_key: false,
    connect_timeout: value.ai.connect_timeout.value ?? 2,
    timeout: value.ai.timeout.value ?? 20,
  },
  library: { driver: value.library.driver.value ?? "disabled", base_url: value.library.base_url.value ?? "" },
})

const snapshot = ({ notifications, ai, library }: Forms): Snapshot => ({
  notifications: JSON.stringify(notifications),
  ai: JSON.stringify({ ...ai, api_key: ai.api_key.trim() }),
  library: JSON.stringify(library),
})

const numberModel = (value: string): number | string => {
  const parsed = Number.parseFloat(value)

  return Number.isNaN(parsed) ? value : parsed
}

const DEFAULT_CONFIRM_DESCRIPTION = "Por seguridad, confirme su contraseña actual para guardar"

export default function AdminSystemSettingsPage() {
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState<SettingsSection | null>(null)
  const [testing, setTesting] = useState<ConnectionSection | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [requestError, setRequestError] = useState<string | null>(null)
  const [confirmFor, setConfirmFor] = useState<ConnectionSection | null>(null)
  const [openSection, setOpenSection] = useState("notificaciones")
  const [notifications, setNotifications] = useState<NotificationsForm>({ emails: true, digest_time: "08:00" })
  const [ai, setAi] = useState<AiForm>({ driver: "disabled", base_url: "", model: "", api_key: "", clear_api_key: false, connect_timeout: 2, timeout: 20 })
  const [library, setLibrary] = useState<LibraryForm>({ driver: "disabled", base_url: "" })
  const [baseline, setBaseline] = useState<Snapshot>(EMPTY_SNAPSHOT)
  const shownConfirmFor = useShownWhileClosing(confirmFor)

  const fill = useCallback((value: SystemSettings): void => {
    const forms = formsFrom(value)
    setSettings(value)
    setNotifications(forms.notifications)
    setAi(forms.ai)
    setLibrary(forms.library)
    setBaseline(snapshot(forms))
  }, [])

  const fetchSettings = useCallback(async (): Promise<void> => {
    try {
      fill(await getSystemSettings())
    } catch (reason) {
      setLoadError(reason instanceof ApiError ? reason.message : "No se pudo cargar la configuración del sistema")
    }
  }, [fill])

  useEffect(() => {
    void fetchSettings()
  }, [fetchSettings])

  const load = (): void => {
    setLoadError(null)
    void fetchSettings()
  }

  const current = snapshot({ notifications, ai, library })
  const dirty = {
    notificaciones: current.notifications !== baseline.notifications,
    ia: current.ai !== baseline.ai,
    biblioteca: current.library !== baseline.library,
  }
  const keyPlaceholder = settings?.ai.api_key.configured ? "Escriba una clave nueva solo para cambiarla" : "Escriba la clave del proveedor"
  const clearKeyLabel = ai.clear_api_key ? "No quitar la clave" : "Quitar la clave"

  const save = async (section: SettingsSection, currentPassword?: string): Promise<void> => {
    setSaving(section)
    setErrors({})
    setRequestError(null)
    const apiKey = ai.api_key.trim()
    const body: Record<string, unknown> =
      section === "notificaciones"
        ? { ...notifications }
        : section === "biblioteca"
          ? { ...library, current_password: currentPassword }
          : {
              driver: ai.driver,
              base_url: ai.base_url,
              model: ai.model,
              connect_timeout: ai.connect_timeout,
              timeout: ai.timeout,
              current_password: currentPassword,
              ...(ai.clear_api_key ? { clear_api_key: true } : apiKey ? { api_key: apiKey } : {}),
            }
    try {
      fill(await updateSystemSettings(section, body))
      setConfirmFor(null)
      toast.success("Ajustes guardados")
    } catch (reason) {
      if (reason instanceof ApiError) {
        const failed: Record<string, string> = Object.fromEntries(Object.entries(reason.errors).map(([key, values]) => [key, values[0] ?? reason.message]))
        setErrors(failed)
        if (Object.keys(failed).length === 0) setRequestError(reason.message)
        if (!failed.current_password) setConfirmFor(null)
      } else {
        setRequestError("No se pudieron guardar los ajustes")
        setConfirmFor(null)
      }
    } finally {
      setSaving(null)
    }
  }

  const openConfirm = (section: ConnectionSection): void => {
    setErrors((previous) => Object.fromEntries(Object.entries(previous).filter(([key]) => key !== "current_password")))
    setConfirmFor(section)
  }

  const test = async (section: ConnectionSection): Promise<void> => {
    setTesting(section)
    try {
      const result = await testSystemConnection(section)
      if (result.ok) toast.success(result.message)
      else toast.error(result.message)
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "No se pudo probar la conexión")
    } finally {
      setTesting(null)
    }
  }

  const saveIcon = (section: SettingsSection) =>
    saving === section ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" aria-hidden="true" />

  const testButton = (section: ConnectionSection) => (
    <Button type="button" variant="outline" disabled={testing !== null} onClick={() => void test(section)}>
      {testing === section ? <Spinner data-icon="inline-start" /> : <PlugZap data-icon="inline-start" aria-hidden="true" />}
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
              description="Avisos por correo y resumen diario para Coordinación"
              icon={Bell}
            >
              <Field orientation="horizontal">
                <Switch id="settings-emails" checked={notifications.emails} onCheckedChange={(emails) => setNotifications((previous) => ({ ...previous, emails }))} />
                <FieldLabel htmlFor="settings-emails" className="font-normal">
                  Enviar avisos por correo
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

            <SettingsAccordionSection value="ia" data-tour="settings-ai" title="Asistente de IA" description="Proveedor que responde al asistente de la plantilla" icon={Bot}>
              <Field data-invalid={Boolean(errors.driver)}>
                <FieldLabel htmlFor="settings-ai-driver" required>
                  Proveedor
                </FieldLabel>
                <Select value={ai.driver} onValueChange={(driver) => setAi((previous) => ({ ...previous, driver }))}>
                  <SelectTrigger id="settings-ai-driver">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="disabled">Desactivado</SelectItem>
                      <SelectItem value="deepseek">DeepSeek</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              {ai.driver !== "disabled" ? (
                <>
                  <Field data-invalid={Boolean(errors.base_url)}>
                    <FieldLabel htmlFor="settings-ai-url" required>
                      Dirección del proveedor
                    </FieldLabel>
                    <Input
                      id="settings-ai-url"
                      value={ai.base_url}
                      onChange={(event) => setAi((previous) => ({ ...previous, base_url: event.target.value }))}
                      placeholder="Ej. https://api.deepseek.com"
                      autoComplete="off"
                      aria-required="true"
                    />
                    {errors.base_url ? <FieldError errors={[errors.base_url]} /> : null}
                  </Field>
                  <Field data-invalid={Boolean(errors.model)}>
                    <FieldLabel htmlFor="settings-ai-model" required>
                      Modelo
                    </FieldLabel>
                    <Input
                      id="settings-ai-model"
                      value={ai.model}
                      onChange={(event) => setAi((previous) => ({ ...previous, model: event.target.value }))}
                      placeholder="Ej. deepseek-chat"
                      autoComplete="off"
                      aria-required="true"
                    />
                    {errors.model ? <FieldError errors={[errors.model]} /> : null}
                  </Field>
                  <Field data-invalid={Boolean(errors.api_key)}>
                    <FieldLabel htmlFor="settings-ai-key">Clave del proveedor</FieldLabel>
                    <div className="relative">
                      <Input
                        id="settings-ai-key"
                        value={ai.api_key}
                        onChange={(event) => setAi((previous) => ({ ...previous, api_key: event.target.value }))}
                        type="password"
                        autoComplete="new-password"
                        disabled={ai.clear_api_key}
                        placeholder={keyPlaceholder}
                        className={cn(settings.ai.api_key.configured && "pr-10")}
                      />
                      {settings.ai.api_key.configured ? (
                        <IconTooltip label={clearKeyLabel}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute inset-y-px right-px h-auto rounded-l-none rounded-r-md px-3 text-muted-foreground hover:bg-transparent hover:text-foreground"
                            aria-label={clearKeyLabel}
                            aria-pressed={ai.clear_api_key}
                            onClick={() => setAi((previous) => ({ ...previous, clear_api_key: !previous.clear_api_key, api_key: "" }))}
                          >
                            {ai.clear_api_key ? <Undo2 className="size-4" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}
                          </Button>
                        </IconTooltip>
                      ) : null}
                    </div>
                    {ai.clear_api_key ? <FieldDescription>La clave se quitará al guardar</FieldDescription> : null}
                    {errors.api_key ? <FieldError errors={[errors.api_key]} /> : null}
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field data-invalid={Boolean(errors.connect_timeout)}>
                      <FieldLabel htmlFor="settings-ai-connect" required>
                        Espera para conectar (s)
                      </FieldLabel>
                      <Input
                        id="settings-ai-connect"
                        value={ai.connect_timeout}
                        onChange={(event) => setAi((previous) => ({ ...previous, connect_timeout: numberModel(event.target.value) }))}
                        type="number"
                        min="1"
                        max="30"
                        aria-required="true"
                      />
                      {errors.connect_timeout ? <FieldError errors={[errors.connect_timeout]} /> : null}
                    </Field>
                    <Field data-invalid={Boolean(errors.timeout)}>
                      <FieldLabel htmlFor="settings-ai-timeout" required>
                        Espera de respuesta (s)
                      </FieldLabel>
                      <Input
                        id="settings-ai-timeout"
                        value={ai.timeout}
                        onChange={(event) => setAi((previous) => ({ ...previous, timeout: numberModel(event.target.value) }))}
                        type="number"
                        min="5"
                        max="300"
                        aria-required="true"
                      />
                      {errors.timeout ? <FieldError errors={[errors.timeout]} /> : null}
                    </Field>
                  </div>
                </>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={saving !== null || !dirty.ia} onClick={() => openConfirm("ia")}>
                  {saveIcon("ia")}
                  Guardar
                </Button>
                {testButton("ia")}
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
                <Field data-invalid={Boolean(errors.base_url && confirmFor !== "ia")}>
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
                <Button type="button" disabled={saving !== null || !dirty.biblioteca} onClick={() => openConfirm("biblioteca")}>
                  {saveIcon("biblioteca")}
                  Guardar
                </Button>
                {testButton("biblioteca")}
              </div>
            </SettingsAccordionSection>
          </Accordion>
        </>
      )}

      <PasswordConfirmDialog
        open={confirmFor !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmFor(null)
        }}
        title={shownConfirmFor === "ia" ? "Guardar el asistente de IA" : "Guardar la biblioteca"}
        description={errors.current_password ?? DEFAULT_CONFIRM_DESCRIPTION}
        confirmLabel="Guardar"
        onConfirm={(password) => {
          if (confirmFor) void save(confirmFor, password)
        }}
      />
    </SettingsLayout>
  )
}
