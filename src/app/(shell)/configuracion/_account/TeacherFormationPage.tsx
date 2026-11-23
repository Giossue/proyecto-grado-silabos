"use client"

import { GraduationCap, Save } from "lucide-react"
import { useState, type FormEvent } from "react"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { TeacherFormationField } from "@/components/domain/identity/TeacherFormationField"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useTeacherFormation } from "@/composables/useTeacherFormation"
import { SettingsLayout } from "@/layouts/settings/Layout"
import { useSession } from "@/state/session"

export default function TeacherFormationPage() {
  const user = useSession().session?.user
  const { formation, setFormation, saving, error, changed, reset, save } = useTeacherFormation()
  const [syncedUser, setSyncedUser] = useState<typeof user | null>(null)
  if (syncedUser !== user) {
    setSyncedUser(user)
    reset()
  }

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void save()
  }

  return (
    <SettingsLayout loading={!user}>
      {!user ? (
        <LoadingSkeleton variant="settings" settingsSection="email" rows={0} />
      ) : (
        <div data-tour="teacher-formation" className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <GraduationCap className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="flex flex-col gap-0.5">
              <h2 className="font-medium">Formación y experiencia académica</h2>
              <p className="text-sm text-muted-foreground">Lo que aparece en sus sílabos como perfil del docente</p>
            </div>
          </div>
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <TeacherFormationField value={formation} onValueChange={setFormation} error={error} />
            <div>
              <Button type="submit" disabled={saving || !changed} data-test="update-formation-button">
                {saving ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" aria-hidden="true" />}
                Guardar
              </Button>
            </div>
          </form>
        </div>
      )}
    </SettingsLayout>
  )
}
