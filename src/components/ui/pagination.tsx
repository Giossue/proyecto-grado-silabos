import * as React from "react"
import { cn } from "cn"
import { Slot } from "radix-ui"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
} from "lucide-react"

import { buttonVariants, type ButtonVariants } from "@/components/ui/button"

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  )
}

function PaginationContent({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex flex-row items-center gap-1", className)}
      {...props}
    />
  )
}

function PaginationItem({ ...props }: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />
}

type PaginationButtonProps = React.ComponentProps<"button"> & {
  asChild?: boolean
  size?: ButtonVariants["size"]
}

function PaginationLink({
  className,
  isActive,
  size = "icon",
  asChild = false,
  ...props
}: PaginationButtonProps & { isActive?: boolean }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="pagination-link"
      data-active={isActive}
      className={cn(
        buttonVariants({ variant: isActive ? "outline" : "ghost", size }),
        className
      )}
      {...props}
    />
  )
}

function edgeButton(slot: string, fallback: React.ReactNode) {
  function PaginationEdge({
    className,
    size = "default",
    asChild = false,
    children,
    ...props
  }: PaginationButtonProps) {
    const Comp = asChild ? Slot.Root : "button"

    return (
      <Comp
        data-slot={slot}
        className={cn(
          buttonVariants({ variant: "ghost", size }),
          "gap-1 px-2.5 sm:pr-2.5",
          className
        )}
        {...props}
      >
        {children ?? fallback}
      </Comp>
    )
  }

  return PaginationEdge
}

const PaginationFirst = edgeButton(
  "pagination-first",
  <>
    <ChevronLeftIcon />
    <span className="hidden sm:block">First</span>
  </>
)

const PaginationPrevious = edgeButton(
  "pagination-previous",
  <>
    <ChevronLeftIcon />
    <span className="hidden sm:block">Previous</span>
  </>
)

const PaginationNext = edgeButton(
  "pagination-next",
  <>
    <span className="hidden sm:block">Next</span>
    <ChevronRightIcon />
  </>
)

const PaginationLast = edgeButton(
  "pagination-last",
  <>
    <span className="hidden sm:block">Last</span>
    <ChevronRightIcon />
  </>
)

function PaginationEllipsis({
  className,
  children,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="pagination-ellipsis"
      className={cn("flex size-9 items-center justify-center", className)}
      {...props}
    >
      {children ?? (
        <>
          <MoreHorizontalIcon />
          <span className="sr-only">Más páginas</span>
        </>
      )}
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationFirst,
  PaginationItem,
  PaginationLast,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
}
