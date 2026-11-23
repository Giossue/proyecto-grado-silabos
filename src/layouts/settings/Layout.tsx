"use client"

import { ArrowLeft, Bell, GraduationCap, Server, Settings, ShieldCheck, UserRound, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import type { ReactNode } from "react"
import { PageFrame } from "@/components/domain/PageFrame"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { areaEmailNotices, areaForPath, areaSetting, areaTeacherFormation, paths, roleHome } from "@/lib/routes"
import { cn } from "@/lib/utils"
import { sessionState } from "@/state/session"
import { settingsReturn } from "@/state/settingsReturn"

const CONTENT_WIDTH = 576

type SettingsNavItem = { title: string; href: string; icon: LucideIcon }

export function SettingsLayout({ loading, children }: { loading?: boolean; children?: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const area = areaForPath(pathname)
  const formation = area ? areaTeacherFormation(area) : null
  const emailNotices = area ? areaEmailNotices(area) : null
  const sidebarNavItems: SettingsNavItem[] = [
    { title: "Perfil", href: area ? areaSetting(area, "profile") : paths.configuration.profile, icon: UserRound },
    ...(formation ? [{ title: "Perfil docente", href: formation, icon: GraduationCap }] : []),
    { title: "Seguridad", href: area ? areaSetting(area, "security") : paths.configuration.security, icon: ShieldCheck },
    ...(emailNotices ? [{ title: "Notificaciones", href: emailNotices, icon: Bell }] : []),
    ...(area === "admin" ? [{ title: "Sistema", href: paths.admin.system, icon: Server }] : []),
  ]

  const goBack = (): void => {
    router.push(settingsReturn.value ?? roleHome(sessionState.current.value?.active_role?.code))
  }

  return (
    <PageFrame
      title="Configuración"
      description="Administre su perfil y seguridad"
      size="wide"
      icon={Settings}
      headerWidth={CONTENT_WIDTH}
      loading={loading}
      eyebrow={<Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={goBack}><ArrowLeft aria-hidden="true" />Volver</Button>}
    >
      <div className="flex min-w-0 flex-col gap-6">
        <nav className="mx-auto flex h-11 w-full items-center justify-start gap-2 border-b" style={{ maxWidth: `${CONTENT_WIDTH}px` }} aria-label="Configuración">
          {sidebarNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "text-muted-foreground inline-flex h-full items-center gap-2 border-b-2 border-transparent px-4 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] hover:text-foreground focus-visible:ring-ring/50 focus-visible:ring-3 [&_svg]:size-4 [&_svg]:shrink-0",
                pathname === item.href && "border-foreground font-semibold text-foreground",
              )}
              aria-current={pathname === item.href ? "page" : undefined}
            >
              <item.icon aria-hidden="true" />
              {item.title}
            </Link>
          ))}
        </nav>

        <Card className="mx-auto w-full min-w-0 gap-12 px-6" style={{ maxWidth: `${CONTENT_WIDTH}px` }}>
          {children}
        </Card>
      </div>
    </PageFrame>
  )
}
