"use client"

import { Save, UserRound } from "lucide-react"
import { useState, type FormEvent } from "react"
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
import { toast } from "@/lib/toast"
import { sessionState, useSession } from "@/state/session"

export default function ProfilePage() {
  const { session } = useSession()
  const user = session?.user
  const [name, setName] = useState(user?.name ?? "")
  const [email, setEmail] = useState(user?.email ?? "")
  const [syncedUser, setSyncedUser] = useState(user)
  if (syncedUser !== user) {
    setSyncedUser(user)
    setName(user?.name ?? "")
    setEmail(user?.email ?? "")
  }
  const [processing, setProcessing] = useState(false)
  const [resending, setResending] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [openSection, setOpenSection] = useState("cuenta")
  const unchanged = name.trim() === (user?.name ?? "") && email.trim() === (user?.email ?? "")

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setProcessing(true)
    setErrors({})
    try {
      sessionState.replace(await updateProfile(name, email))
      toast.success("Perfil actualizado")
    } catch (reason) {
      if (reason instanceof ApiError) {
        const failed: Record<string, string> = Object.fromEntries(Object.entries(reason.errors).map(([key, values]) => [key, values[0] ?? reason.message]))
        setErrors(Object.keys(failed).length === 0 ? { request: reason.message } : failed)
      } else {
        setErrors({ request: "No se pudo actualizar el perfil" })
      }
    } finally {
      setProcessing(false)
    }
  }

  const resendVerification = async (): Promise<void> => {
    setResending(true)
    setErrors({})
    try {
      const response = await resendActivation()
      toast.success(response.message)
    } catch (reason) {
      setErrors({ request: reason instanceof ApiError ? reason.message : "No se pudo reenviar el enlace de activación" })
    } finally {
      setResending(false)
    }
  }

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
            <InputError message={errors.request} />

            {user.can_edit_identity ? (
              <form data-tour="profile-form" className="flex flex-col gap-6" onSubmit={(event) => void submit(event)}>
                <div className="grid gap-2">
                  <Label htmlFor="name" required>
                    Nombre completo
                  </Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="mt-1 block w-full"
                    name="nombre"
                    aria-required="true"
                    autoComplete="name"
                    placeholder="Ej. MARÍA JOSÉ PÉREZ LÓPEZ"
                    aria-invalid={Boolean(errors.nombre)}
                    aria-describedby={errors.nombre ? "name-error" : undefined}
                  />
                  <InputError id="name-error" className="mt-2" message={errors.nombre} />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="email" required>
                    Correo electrónico
                  </Label>
                  <Input
                    id="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    type="email"
                    className="mt-1 block w-full"
                    name="correo_electronico"
                    aria-required="true"
                    autoComplete="username"
                    placeholder="Ej. maria.perez@ueb.edu.ec"
                    aria-invalid={Boolean(errors.correo_electronico)}
                    aria-describedby={errors.correo_electronico ? "email-error" : undefined}
                    disabled={user.email_verified}
                  />
                  {user.email_verified ? <p className="text-sm text-muted-foreground">La cuenta ya fue activada: su correo no se puede cambiar</p> : null}
                  <InputError id="email-error" className="mt-2" message={errors.correo_electronico} />
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
