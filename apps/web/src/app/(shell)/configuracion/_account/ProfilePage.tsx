"use client"

import { UserRound } from "lucide-react"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { TextLink } from "@/components/TextLink"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SettingsLayout } from "@/layouts/settings/Layout"
import { useSession } from "@/state/session"

export default function ProfilePage() {
  const { session } = useSession()
  const user = session?.user

  return (
    <SettingsLayout loading={!user}>
      {!user ? (
        <LoadingSkeleton variant="settings" settingsSection="profile" />
      ) : (
        <section data-tour="profile-readonly" aria-labelledby="profile-account-title" className="-mt-2 flex flex-col">
          <header className="flex items-center gap-3 py-4">
            <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="flex flex-col gap-0.5">
              <h2 id="profile-account-title" className="text-sm font-medium">
                Datos de la cuenta
              </h2>
              <p className="text-sm text-muted-foreground">Consulte su nombre y correo</p>
            </div>
          </header>

          <div className="flex flex-col gap-6 px-1 pt-2 pb-2">
            <div className="grid gap-2">
              <Label htmlFor="readonly-name">Nombre completo</Label>
              <Input id="readonly-name" value={user.name} readOnly placeholder="Ej. MARÍA JOSÉ PÉREZ LÓPEZ" disabled aria-describedby="identity-help" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="readonly-email">Correo electrónico</Label>
              <Input id="readonly-email" type="email" value={user.email} readOnly placeholder="Ej. maria.perez@ueb.edu.ec" disabled aria-describedby="identity-help" />
            </div>
            <p id="identity-help" className="text-sm text-muted-foreground">
              {user.can_edit_identity ? (
                <>
                  Si su nombre o correo están mal, corríjalos en <TextLink href="/admin/usuarios">Usuarios</TextLink>
                </>
              ) : (
                "Si necesita corregir su nombre o correo, solicite el cambio a Administración"
              )}
            </p>
          </div>
        </section>
      )}
    </SettingsLayout>
  )
}
