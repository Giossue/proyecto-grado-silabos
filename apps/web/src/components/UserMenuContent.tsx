"use client"

import { Building2, LogOut, Moon, PersonStanding, Settings, Sun } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { leaveActiveRole } from "@/api/session"
import { UserInfo } from "@/components/UserInfo"
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { useAppearance } from "@/composables/useAppearance"
import { paths, roleSetting } from "@/lib/routes"
import { accessibilityDialogOpen } from "@/state/accessibilityDialog"
import { sessionState, useSession } from "@/state/session"
import { logoutConfirmOpen } from "@/state/shellDialogs"
import type { User } from "@/types"

export function UserMenuContent({ user }: { user: User }) {
  const router = useRouter()
  const { appearance, updateAppearance } = useAppearance()
  const dark = appearance === "dark"
  const { session } = useSession()
  const canSwitchScope = session?.active_role != null && (session?.available_roles.length ?? 0) > 1
  const code = session?.active_role?.code
  const settingsHref = code ? roleSetting(code, "profile") : null

  const switchScope = async (): Promise<void> => {
    sessionState.replace(await leaveActiveRole())
    router.push(paths.roleSelection)
  }

  return (
    <>
      <DropdownMenuLabel className="p-0 font-normal">
        <div className="flex min-w-0 items-start gap-2 px-1 py-1.5 text-left text-sm">
          <UserInfo user={user} showEmail showFullName />
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      {settingsHref ? (
        <DropdownMenuItem asChild>
          <Link href={settingsHref} className="w-full">
            <Settings data-icon="inline-start" aria-hidden="true" />
            Configuración
          </Link>
        </DropdownMenuItem>
      ) : null}
      {canSwitchScope ? (
        <DropdownMenuItem data-test="switch-scope" onSelect={() => void switchScope()}>
          <Building2 data-icon="inline-start" aria-hidden="true" />
          Cambiar carrera o rol
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem className="sm:hidden" onSelect={() => updateAppearance(dark ? "light" : "dark")}>
        {dark ? <Sun data-icon="inline-start" aria-hidden="true" /> : <Moon data-icon="inline-start" aria-hidden="true" />}
        {dark ? "Tema claro" : "Tema oscuro"}
      </DropdownMenuItem>
      <DropdownMenuItem className="sm:hidden" onSelect={() => { accessibilityDialogOpen.value = true }}>
        <PersonStanding data-icon="inline-start" aria-hidden="true" />
        Accesibilidad
      </DropdownMenuItem>
      {settingsHref ? <DropdownMenuSeparator /> : null}
      <DropdownMenuItem variant="destructive" className="w-full" data-test="logout-button" onSelect={() => { logoutConfirmOpen.value = true }}>
        <LogOut data-icon="inline-start" aria-hidden="true" />
        Cerrar sesión
      </DropdownMenuItem>
    </>
  )
}
