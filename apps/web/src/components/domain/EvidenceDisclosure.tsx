"use client"

import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

export function EvidenceDisclosure({ label, excerpt }: { label: string; excerpt: string }) {
  return (
    <Collapsible className="min-w-0">
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" size="row">
          <ChevronDown data-icon="inline-start" aria-hidden="true" />
          <span className="min-w-0 break-words">{label}</span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <blockquote className="border-l-2 pl-3 text-sm break-words whitespace-pre-wrap">{excerpt}</blockquote>
      </CollapsibleContent>
    </Collapsible>
  )
}
