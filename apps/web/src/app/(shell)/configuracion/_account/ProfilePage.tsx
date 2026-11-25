"use client"

import { Save, UserRound } from "lucide-react"
import { useState } from "react"
import { Controller } from "react-hook-form"
import { ApiError } from "@/api/client"
import { resendActivation, updateProfile } from "@/api/session"
import { InputError } from "@/components/InputError"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { SettingsAccordionSection } from "@/components/domain/SettingsAccordionSection"
import { TextLink } from "@/components/TextLink"
import { Accordion } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { SettingsLayout } from "@/layouts/settings/Layout"
import { applyApiErrors, fieldMessage, SERVER_ERROR, serverMessage, useSchemaForm } from "@/lib/forms"
import { toast } from "@/lib/toast"
import { profileSchema, type ProfileValues } from "@silabos/shared/schemas/account"
import { sessionState, useSession } from "@/state/session"

const schema = profileSchema()

export default function ProfilePage() {
  const { session } = useSession()
  const user = session?.user
  const form = useSchemaForm(schema, { defaultValues: { nombre: user?.name ?? "", correo_electronico: user?.email ?? "" } })
  const { errors, isSubmitting: processing } = form.formState
  const [syncedUser, setSyncedUser] = useState(user)
  if (syncedUser !== user) {
    setSyncedUser(user)
    form.reset({ nombre: user?.name ?? "", correo_electronico: user?.email ?? "" })
  }
  const [resending, setResending] = useState(false)
  const [openSection, setOpenSection] = useState("cuenta")
  const [name, email] = form.watch(["nombre", "correo_electronico"])
  const unchanged = name.trim() === (user?.name ?? "") && String(email ?? "").trim() === (user?.email ?? "")

  const submit = async ({ nombre, correo_electronico }: ProfileValues): Promise<void> => {
    try {
      sessionState.replace(await updateProfile(nombre, correo_electronico))
      toast.success("Perfil actualizado")
    } catch (reason) {
      applyApiErrors(form.setError, reason, { fallback: "No se pudo actualizar el perfil" })
    }
  }

  const resendVerification = async (): Promise<void> => {
    setResending(true)
    form.clearErrors()
    try {
      const response = await resendActivation()
      toast.success(response.message)
    } catch (reason) {
      form.setError(SERVER_ERROR, { type: "server", message: reason instanceof ApiError ? reason.message : "No se pudo reenviar el enlace de activación" })
    } finally {
      setResending(false)
    }
  }

  const nameError = fieldMessage(errors, "nombre")
  const emailError = fieldMessage(errors, "correo_electronico")

  return (
    <SettingsLayout loading={!user}>
      {!user ? (
        <LoadingSkeleton variant="settings" settingsSection="profile" readonly={session?.active_role?.code !== "administrador"} />
      ) : (
        <Accordion type="single" collapsible value={openSection} onValueChange={setOpenSection} className="-mt-2">
          <SettingsAccordionSection
            value="cuenta"
            title="Datos de la cuenta"
            description={user.can_edit_identity ? "Actualice su nombre y correo electrónico" : "Consulte su nombre y correo"}
            icon={UserRound}
            keepMounted
          >
            <InputError message={serverMessage(errors)} />

            {user.can_edit_identity ? (
              <form data-tour="profile-form" className="flex flex-col gap-6" onSubmit={form.handleSubmit(submit)}>
                <div className="grid gap-2">
                  <Label htmlFor="name" required>
                    Nombre completo
                  </Label>
                  <Controller
                    name="nombre"
                    control={form.control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        id="name"
                        className="mt-1 block w-full"
                        aria-required="true"
                        autoComplete="name"
                        placeholder="Ej. MARÍA JOSÉ PÉREZ LÓPEZ"
                        aria-invalid={Boolean(nameError)}
                        aria-describedby={nameError ? "name-error" : undefined}
                      />
                    )}
                  />
                  <InputError id="name-error" className="mt-2" message={nameError} />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="email" required>
                    Correo electrónico
                  </Label>
                  <Controller
                    name="correo_electronico"
                    control={form.control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        id="email"
                        type="email"
                        className="mt-1 block w-full"
                        aria-required="true"
                        autoComplete="username"
                        placeholder="Ej. maria.perez@ueb.edu.ec"
                        aria-invalid={Boolean(emailError)}
                        aria-describedby={emailError ? "email-error" : undefined}
                        disabled={user.email_verified}
                      />
                    )}
                  />
                  {user.email_verified ? <p className="text-sm text-muted-foreground">La cuenta ya fue activada: su correo no se puede cambiar</p> : null}
                  <InputError id="email-error" className="mt-2" message={emailError} />
                </div>

                {!user.email_verified ? (
                  <div>
                    <p className="-mt-4 text-sm text-muted-foreground">
                      Su cuenta aún no está activada.{" "}
                      <TextLink as="button" tabIndex={0} disabled={resending} onClick={() => void resendVerification()}>
                        Reenviar el enlace de activación
                      </TextLink>
                    </p>
                  </div>
                ) : null}

                <div className="flex items-center gap-4">
                  <Button type="submit" disabled={processing || unchanged} data-test="update-profile-button">
                    {processing ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" aria-hidden="true" />}
                    Guardar
                  </Button>
                </div>
              </form>
            ) : (
              <div data-tour="profile-readonly" className="flex flex-col gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="readonly-name">Nombre completo</Label>
                  <Input id="readonly-name" value={user.name} readOnly placeholder="Ej. MARÍA JOSÉ PÉREZ LÓPEZ" disabled aria-describedby="identity-help" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="readonly-email">Correo electrónico</Label>
                  <Input id="readonly-email" type="email" value={user.email} readOnly placeholder="Ej. maria.perez@ueb.edu.ec" disabled aria-describedby="identity-help" />
                </div>
                <p id="identity-help" className="text-sm text-muted-foreground">
                  Si necesita corregir su nombre o correo, solicite el cambio a Administración
                </p>
              </div>
            )}
          </SettingsAccordionSection>
        </Accordion>
      )}
    </SettingsLayout>
  )
}
