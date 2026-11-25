import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { formatDateDisplay } from "@/lib/dateDisplay"

type CommentEntryProps = {
  revision: number | string
  content: string
  author?: string
  date?: string
  badges?: ReactNode
}

export function CommentEntry({ revision, content, author, date, badges }: CommentEntryProps) {
  return (
    <Card className="gap-3 rounded-md py-3">
      <CardHeader className="flex flex-row flex-wrap items-center gap-2 px-4">
        <Badge variant="outline">Versión {revision}</Badge>
        {badges}
      </CardHeader>
      <CardContent className="px-4 text-sm whitespace-pre-wrap">{content}</CardContent>
      {author || date ? (
        <CardFooter className="px-4 text-xs text-muted-foreground">{[author, date ? formatDateDisplay(date) : null].filter(Boolean).join(" · ")}</CardFooter>
      ) : null}
    </Card>
  )
}
