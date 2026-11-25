"use client"

import { ChevronDown, CircleUser } from "lucide-react"
import { UserInfo } from "@/components/UserInfo"
import { UserMenuContent } from "@/components/UserMenuContent"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { sessionUser } from "@/lib/sessionUser"
import { useSession } from "@/state/session"

export function NavUser() {
  const compact = useMediaQuery("(width < 40rem)")
  const user = sessionUser(useSession().session)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-11 rounded-md px-2 max-sm:h-12 max-sm:min-w-16 max-sm:flex-col max-sm:gap-0.5 max-sm:order-2"
          data-user-menu=""
        >
          <CircleUser className="sm:hidden size-5" aria-hidden="true" />
          <span className="text-xs font-medium sm:hidden">Perfil</span>
          <div className="flex min-w-0 flex-1 items-center gap-2 max-sm:hidden">
            <UserInfo user={user} showFullName />
            <ChevronDown className="hidden sm:block" data-icon="inline-end" aria-hidden="true" />
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-72 max-w-(--radix-dropdown-menu-content-available-width) rounded-md"
        side={compact ? "top" : "bottom"}
        align={compact ? "center" : "end"}
        sideOffset={4}
      >
        <UserMenuContent user={user} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
