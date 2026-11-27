"use client"

import { ArrowLeft, BookOpenCheck, Building2, FolderOpen, UsersRound } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { paths } from "@/lib/routes"

/** The career Administration works on: `id` for the API, `code` for page addresses. */
export type AdminCareer = { id: string; code: string }

export type AdminCareerScreen = "curriculum" | "schedule" | "teachers" | "project"

const screens: Array<{ value: AdminCareerScreen; label: string; icon: typeof BookOpenCheck; href: (career: string) => string }> = [
  { value: "curriculum", label: "Malla", icon: BookOpenCheck, href: paths.admin.careerCurriculum },
  { value: "schedule", label: "Materias y paralelos", icon: Building2, href: paths.admin.careerSchedule },
  { value: "teachers", label: "Docentes", icon: UsersRound, href: paths.admin.careerTeachers },
  { value: "project", label: "Proyecto de carrera", icon: FolderOpen, href: paths.admin.careerProject },
]

export function AdminCareerBackLink() {
  return (
    <Button asChild variant="link" size="sm" className="h-auto px-0">
      <Link href={paths.admin.academicWithSection("carrera")}>
        <ArrowLeft aria-hidden="true" />
        Facultades y carreras
      </Link>
    </Button>
  )
}

export function AdminCareerTabs({ careerCode, current }: { careerCode: string; current: AdminCareerScreen }) {
  const router = useRouter()
  const go = (value: string): void => {
    const screen = screens.find((item) => item.value === value)
    if (screen && screen.value !== current) router.push(screen.href(careerCode))
  }

  return (
    <Tabs value={current} onValueChange={go}>
      <TabsList className="h-11 justify-start" aria-label="Trabajo de la carrera">
        {screens.map(({ value, label, icon: Icon }) => (
          <TabsTrigger key={value} value={value} className="flex-none gap-2 px-4 data-[state=active]:font-semibold">
            <Icon aria-hidden="true" />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
