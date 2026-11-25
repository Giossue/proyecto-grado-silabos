"use client"

import { Plus, X, type LucideIcon } from "lucide-react"
import { Children, Fragment, isValidElement, useEffect, useState, type CSSProperties, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useCurrentFullPath } from "@/composables/useCurrentUrl"
import { useActiveNavItem } from "@/composables/useMainNavItems"
import { usePageTitle } from "@/composables/usePageBreadcrumbs"
import { useScrollDirection } from "@/composables/useScrollDirection"
import { usePageHeading } from "@/lib/pageAnnouncement"
import { withoutEndPeriod } from "@/lib/text"
import { cn } from "@/lib/utils"

type PageFrameProps = {
  title: string
  description: string
  size?: "full" | "wide" | "narrow"
  headerWidth?: number
  headerClass?: string
  icon?: LucideIcon
  hideIcon?: boolean
  loading?: boolean
  actionsSkeleton?: string[]
  className?: string
  banner?: ReactNode
  eyebrow?: ReactNode
  titleBadge?: ReactNode
  meta?: ReactNode
  tools?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}

const widthClasses = {
  full: "",
  wide: "mx-auto w-full max-w-6xl",
  narrow: "mx-auto w-full max-w-4xl",
} as const

const countActions = (nodes: ReactNode): number =>
  Children.toArray(nodes).reduce<number>((total, node) => {
    if (isValidElement<{ children?: ReactNode }>(node) && node.type === Fragment) {
      return total + countActions(node.props.children)
    }
    return isValidElement(node) ? total + 1 : total
  }, 0)

export function PageFrame({
  title,
  description,
  size = "full",
  headerWidth,
  headerClass,
  icon,
  hideIcon,
  loading = false,
  actionsSkeleton = [],
  className,
  banner,
  eyebrow,
  titleBadge,
  meta,
  tools,
  actions,
  children,
}: PageFrameProps) {
  const headerStyle: CSSProperties | undefined = headerWidth ? { width: `${headerWidth}px`, maxWidth: "100%" } : undefined
  const { setTitle } = usePageTitle()
  const navItem = useActiveNavItem()
  const HeaderIcon = hideIcon ? null : icon ?? navItem?.icon ?? null

  useEffect(() => {
    setTitle(title)
    return () => setTitle((current) => (current === title ? "" : current))
  }, [setTitle, title])

  usePageHeading(title)

  const actionCount = loading ? 0 : countActions(actions)
  const needsTrigger = actionCount > 1

  const [expanded, setExpanded] = useState(false)
  const { hidden } = useScrollDirection()
  const fullPath = useCurrentFullPath()
  const [expandedPath, setExpandedPath] = useState(fullPath)
  if (expandedPath !== fullPath) {
    setExpandedPath(fullPath)
    setExpanded(false)
  }

  const floatingHidden = hidden && !expanded

  return (
    <div className="contents">
      {banner ? <div className="flex flex-col [&>*+*]:border-t-0">{banner}</div> : null}
      <div
        className={cn(
          "flex min-w-0 flex-col gap-6 overflow-x-clip p-4 sm:p-6",
          actionCount > 0 && "max-sm:pb-(--page-mobile-actions-inset)",
          widthClasses[size],
          className,
        )}
      >
        <header
          data-tour="page-header"
          className={cn("flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", tools && "max-sm:flex-row max-sm:items-start", headerWidth && "mx-auto", headerClass)}
          style={headerStyle}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {eyebrow ? <div className="-mt-1">{eyebrow}</div> : null}

            <div className="flex items-center gap-3">
              {loading && HeaderIcon ? (
                <Skeleton data-skeleton="page-icon" className="size-11 shrink-0 rounded-md" />
              ) : HeaderIcon && title ? (
                <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground" aria-hidden="true">
                  <HeaderIcon className="size-5" />
                </div>
              ) : null}
              {loading ? (
                <div className="flex min-w-0 flex-col gap-1">
                  {title ? <h1 className="sr-only">{title}</h1> : null}
                  <Skeleton data-skeleton="page-title" className="h-8 w-72 max-w-full" />
                  <Skeleton data-skeleton="page-description" className="h-6 w-96 max-w-full" />
                </div>
              ) : (
                <div className="flex min-w-0 flex-col gap-1">
                  {title && titleBadge ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
                      {titleBadge}
                    </div>
                  ) : title ? (
                    <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
                  ) : null}
                  {description ? <p className="max-w-3xl text-muted-foreground">{withoutEndPeriod(description)}</p> : null}
                </div>
              )}
            </div>
            {meta ? <div className="flex flex-wrap items-center gap-2 pt-1">{meta}</div> : null}
          </div>

          {tools && !loading ? (
            <div data-tour="page-tools" className="flex shrink-0 items-center gap-1 sm:-mr-2 sm:gap-2">
              {tools}
            </div>
          ) : null}

          {actionCount === 0 && actionsSkeleton.length > 0 ? (
            <div data-skeleton="page-actions" className="hidden shrink-0 items-center gap-2 sm:flex" aria-hidden="true">
              {actionsSkeleton.map((width, index) => (
                <Skeleton key={index} className={cn("h-9", width)} />
              ))}
            </div>
          ) : null}

          {actionCount > 0 ? (
            <div
              data-tour="page-actions"
              className={cn(
                "flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap sm:justify-end",
                "max-sm:fixed max-sm:scroll-lock-offset max-sm:z-40 max-sm:w-auto max-sm:flex-col max-sm:items-end",
                "max-sm:right-(--page-mobile-actions-right) max-sm:bottom-(--page-mobile-actions-bottom)",
                "max-sm:transition-[translate,opacity] max-sm:duration-200 max-sm:ease-out",
                floatingHidden && "max-sm:pointer-events-none max-sm:translate-y-24 max-sm:opacity-0",
              )}
            >
              <div
                className={cn(
                  "contents",
                  needsTrigger && !expanded && "max-sm:hidden max-sm:[&>*]:hidden",
                  "max-sm:[&>*]:shadow-menu",
                  !needsTrigger &&
                    "max-sm:[&_button]:size-14 max-sm:[&_button]:rounded-full max-sm:[&_button]:gap-0 max-sm:[&_button]:p-0 max-sm:[&_button]:text-[length:0] max-sm:[&_button]:[&_svg]:size-5",
                )}
              >
                {actions}
              </div>

              {needsTrigger ? (
                <Button
                  type="button"
                  className="size-14 rounded-full p-0 shadow-menu sm:hidden"
                  aria-expanded={expanded}
                  aria-label={expanded ? "Cerrar acciones de la pantalla" : `Ver ${actionCount} acciones de la pantalla`}
                  onClick={() => setExpanded((value) => !value)}
                >
                  {expanded ? <X aria-hidden="true" /> : <Plus aria-hidden="true" />}
                </Button>
              ) : null}
            </div>
          ) : null}
        </header>

        {children}
      </div>
    </div>
  )
}
