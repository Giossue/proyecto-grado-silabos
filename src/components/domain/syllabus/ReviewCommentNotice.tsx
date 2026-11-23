import { MessageSquareWarning } from "lucide-react"
import type { SyllabusDetail } from "@/api/syllabi"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { formatDateDisplay } from "@/lib/dateDisplay"
import { libraryCommentLines } from "@/lib/reviewComment"

type ReviewComment = NonNullable<SyllabusDetail["review_comments"]>[number]

const STAGE_NAME: Record<ReviewComment["stage"], string> = { biblioteca: "Biblioteca", coordinacion: "Coordinación" }

export function ReviewCommentNotice({ comments }: { comments: ReviewComment[] }) {
  const latest = comments[0]!
  const lines = latest.stage === "biblioteca" ? libraryCommentLines(latest.comment) : []

  return (
    <Alert className="review-comment bg-notice text-notice-foreground ring-notice-border [&>svg]:text-warning">
      <MessageSquareWarning aria-hidden="true" />
      <AlertTitle>{STAGE_NAME[latest.stage]} pidió correcciones</AlertTitle>
      <AlertDescription className="flex flex-col gap-1 text-notice-foreground/80">
        {lines.length ? (
          <ul className="list-disc break-words pl-5 text-foreground">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="break-words whitespace-pre-wrap text-foreground">{latest.comment}</p>
        )}
        <p className="text-xs">
          {latest.commented_by} · {formatDateDisplay(latest.commented_at)}
        </p>
      </AlertDescription>
    </Alert>
  )
}
