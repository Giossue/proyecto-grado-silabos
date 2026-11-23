import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

type SettingsAccordionSectionProps = {
  value: string
  title: string
  description: string
  icon: LucideIcon
  keepMounted?: boolean
  "data-tour"?: string
  children?: ReactNode
}

export function SettingsAccordionSection({ value, title, description, icon: Icon, keepMounted = false, "data-tour": tour, children }: SettingsAccordionSectionProps) {
  return (
    <AccordionItem value={value} data-tour={tour} className="group/settings-section">
      <AccordionTrigger>
        <span className="flex items-center gap-3 text-left">
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">{title}</span>
            <span className="text-sm font-normal text-muted-foreground">{description}</span>
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent forceMount={keepMounted || undefined} className={keepMounted ? "group-data-[state=closed]/settings-section:hidden" : undefined}>
        <div className="flex flex-col gap-6 px-1 pt-2 pb-2">{children}</div>
      </AccordionContent>
    </AccordionItem>
  )
}
