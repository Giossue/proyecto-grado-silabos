"use client"

import { ArrowDownIcon } from "lucide-react"
import { useCallback, type ComponentProps, type ReactNode } from "react"
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type ConversationProps = ComponentProps<typeof StickToBottom>

export const Conversation = ({ className, initial = true, damping = 0.7, stiffness = 0.05, mass = 1.25, "aria-label": label = "Conversation", ...props }: ConversationProps) => (
  <StickToBottom className={cn("relative flex-1 overflow-y-hidden", className)} initial={initial} damping={damping} stiffness={stiffness} mass={mass} role="log" aria-label={label} {...props} />
)

export type ConversationContentProps = ComponentProps<typeof StickToBottom.Content>

export const ConversationContent = ({ className, ...props }: ConversationContentProps) => (
  <StickToBottom.Content className={cn("flex flex-col gap-8 p-4", className)} {...props} />
)

export type ConversationEmptyStateProps = ComponentProps<"div"> & {
  title?: string
  description?: string
  icon?: ReactNode
}

export const ConversationEmptyState = ({ className, title = "No messages yet", description = "Start a conversation to see messages here", icon, children, ...props }: ConversationEmptyStateProps) => (
  <div className={cn("flex size-full flex-col items-center justify-center gap-3 p-8 text-center", className)} {...props}>
    {children ?? (
      <>
        {icon ? <div className="text-muted-foreground">{icon}</div> : null}
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">{title}</h3>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </>
    )}
  </div>
)

export type ConversationScrollButtonProps = ComponentProps<typeof Button>

export const ConversationScrollButton = ({ className, ...props }: ConversationScrollButtonProps) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext()
  const handleScrollToBottom = useCallback(() => {
    scrollToBottom()
  }, [scrollToBottom])

  if (isAtBottom) return null

  return (
    <IconTooltip label="Ir al final">
      <Button className={cn("absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-background hover:bg-muted", className)} aria-label="Ir al final" size="icon" type="button" variant="outline" onClick={handleScrollToBottom} {...props}>
        <ArrowDownIcon className="size-4" aria-hidden="true" />
      </Button>
    </IconTooltip>
  )
}
