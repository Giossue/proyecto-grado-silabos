import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getInitials } from "@/composables/useInitials"
import { cn } from "@/lib/utils"
import type { User } from "@/types"

type UserInfoProps = {
  user: User
  showEmail?: boolean
  showFullName?: boolean
  nameClass?: string
  subtitle?: string | null
}

export function UserInfo({ user, showEmail = false, showFullName = false, nameClass, subtitle }: UserInfoProps) {
  const showAvatar = Boolean(user.avatar && user.avatar !== "")

  return (
    <>
      <Avatar className="size-8 overflow-hidden">
        {showAvatar ? <AvatarImage src={user.avatar} alt={user.nombre} /> : null}
        <AvatarFallback className="border border-border bg-muted text-muted-foreground">
          {getInitials(user.nombre)}
        </AvatarFallback>
      </Avatar>

      <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
        <span className={cn("font-medium", showFullName ? "whitespace-normal wrap-break-word" : "truncate", nameClass)}>{user.nombre}</span>
        {subtitle || showEmail ? (
          <span className="truncate text-xs text-muted-foreground">
            {subtitle ?? user.correo_electronico}
          </span>
        ) : null}
      </div>
    </>
  )
}
