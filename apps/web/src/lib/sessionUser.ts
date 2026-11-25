import type { Session } from "@/api/session"
import type { User } from "@/types"

export const sessionUser = (session: Session | null): User => ({
  id: session?.user.id ?? "",
  nombre: session?.user.name ?? "",
  correo_electronico: session?.user.email ?? "",
  avatar: undefined,
  correo_verificado_en: session?.user.email_verified ? "verificado" : null,
})
