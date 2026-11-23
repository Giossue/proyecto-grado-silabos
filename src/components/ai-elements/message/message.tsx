"use client"

import type { UIMessage } from "ai"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { Children, createContext, useContext, useEffect, useState, type ComponentProps, type ReactElement } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export type MessageProps = ComponentProps<"div"> & { from: UIMessage["role"] }

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div className={cn("group flex w-full max-w-4/5 gap-2", from === "user" ? "is-user ml-auto justify-end" : "is-assistant", className)} {...props} />
)

export type MessageContentProps = ComponentProps<"div">

export const MessageContent = ({ className, ...props }: MessageContentProps) => (
  <div
    className={cn(
      "is-user:dark flex w-fit flex-col gap-2 overflow-hidden text-sm",
      "group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground",
      "group-[.is-assistant]:text-foreground",
      className,
    )}
    {...props}
  />
)

export type MessageActionsProps = ComponentProps<"div">

export const MessageActions = ({ className, ...props }: MessageActionsProps) => <div className={cn("flex items-center gap-1", className)} {...props} />

export type MessageActionProps = ComponentProps<typeof Button> & { tooltip?: string; label?: string }

export const MessageAction = ({ tooltip, label, variant = "ghost", size = "icon-sm", children, ...props }: MessageActionProps) => {
  const button = (
    <Button size={size} type="button" variant={variant} {...props}>
      {children}
      <span className="sr-only">{label || tooltip}</span>
    </Button>
  )

  if (!tooltip) return button

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export type MessageAvatarProps = ComponentProps<typeof Avatar> & { src: string; name?: string }

export const MessageAvatar = ({ src, name, className, ...props }: MessageAvatarProps) => (
  <Avatar className={cn("size-8 ring-1 ring-surface-ring", className)} {...props}>
    <AvatarImage alt="" className="mt-0 mb-0" src={src} />
    <AvatarFallback>{name?.slice(0, 2) ?? "ME"}</AvatarFallback>
  </Avatar>
)

type MessageBranchContextType = {
  currentBranch: number
  totalBranches: number
  goToPrevious: () => void
  goToNext: () => void
  branches: ReactElement[]
  setBranches: (branches: ReactElement[]) => void
}

const MessageBranchContext = createContext<MessageBranchContextType | null>(null)

const useMessageBranch = (): MessageBranchContextType => {
  const context = useContext(MessageBranchContext)
  if (!context) throw new Error("MessageBranch components must be used within MessageBranch")
  return context
}

export type MessageBranchProps = ComponentProps<"div"> & { defaultBranch?: number; onBranchChange?: (branchIndex: number) => void }

export const MessageBranch = ({ defaultBranch = 0, onBranchChange, className, ...props }: MessageBranchProps) => {
  const [currentBranch, setCurrentBranch] = useState(defaultBranch)
  const [branches, setBranches] = useState<ReactElement[]>([])
  const handleBranchChange = (index: number): void => {
    setCurrentBranch(index)
    onBranchChange?.(index)
  }
  const goToPrevious = (): void => {
    if (branches.length === 0) return
    handleBranchChange(currentBranch > 0 ? currentBranch - 1 : branches.length - 1)
  }
  const goToNext = (): void => {
    if (branches.length === 0) return
    handleBranchChange(currentBranch < branches.length - 1 ? currentBranch + 1 : 0)
  }
  const value: MessageBranchContextType = { currentBranch, totalBranches: branches.length, goToPrevious, goToNext, branches, setBranches }

  return (
    <MessageBranchContext.Provider value={value}>
      <div className={cn("grid w-full gap-2 [&>div]:pb-0", className)} {...props} />
    </MessageBranchContext.Provider>
  )
}

export type MessageBranchContentProps = ComponentProps<"div">

export const MessageBranchContent = ({ children, className, ...props }: MessageBranchContentProps) => {
  const { currentBranch, setBranches, branches } = useMessageBranch()
  const childrenArray = Children.toArray(children) as ReactElement[]

  useEffect(() => {
    if (branches.length !== childrenArray.length) setBranches(childrenArray)
  }, [childrenArray, branches, setBranches])

  return childrenArray.map((branch, index) => (
    <div key={branch.key ?? index} className={cn("grid gap-2 overflow-hidden [&>div]:pb-0", index === currentBranch ? "block" : "hidden", className)} {...props}>
      {branch}
    </div>
  ))
}

export type MessageBranchSelectorProps = ComponentProps<typeof ButtonGroup> & { from: UIMessage["role"] }

export const MessageBranchSelector = ({ className, from, ...props }: MessageBranchSelectorProps) => {
  const { totalBranches } = useMessageBranch()
  void from
  if (totalBranches <= 1) return null

  return <ButtonGroup className={cn("[&>*:not(:first-child)]:rounded-l-md [&>*:not(:last-child)]:rounded-r-md", className)} orientation="horizontal" {...props} />
}

export type MessageBranchPreviousProps = ComponentProps<typeof Button>

export const MessageBranchPrevious = ({ children, ...props }: MessageBranchPreviousProps) => {
  const { goToPrevious, totalBranches } = useMessageBranch()

  return (
    <Button aria-label="Previous branch" disabled={totalBranches <= 1} size="icon-sm" type="button" variant="ghost" onClick={goToPrevious} {...props}>
      {children ?? <ChevronLeftIcon size={14} />}
    </Button>
  )
}

export type MessageBranchNextProps = ComponentProps<typeof Button>

export const MessageBranchNext = ({ children, ...props }: MessageBranchNextProps) => {
  const { goToNext, totalBranches } = useMessageBranch()

  return (
    <Button aria-label="Next branch" disabled={totalBranches <= 1} size="icon-sm" type="button" variant="ghost" onClick={goToNext} {...props}>
      {children ?? <ChevronRightIcon size={14} />}
    </Button>
  )
}

export type MessageBranchPageProps = ComponentProps<typeof ButtonGroupText>

export const MessageBranchPage = ({ className, ...props }: MessageBranchPageProps) => {
  const { currentBranch, totalBranches } = useMessageBranch()

  return (
    <ButtonGroupText className={cn("border-none bg-transparent text-muted-foreground shadow-none", className)} {...props}>
      {currentBranch + 1} of {totalBranches}
    </ButtonGroupText>
  )
}

export type MessageToolbarProps = ComponentProps<"div">

export const MessageToolbar = ({ className, ...props }: MessageToolbarProps) => (
  <div className={cn("mt-4 flex w-full items-center justify-between gap-4", className)} {...props} />
)

