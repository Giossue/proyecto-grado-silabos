import Link from "next/link"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

const linkClass = "cursor-pointer text-foreground underline decoration-border underline-offset-4 transition-colors duration-300 ease-out hover:decoration-current"

type TextLinkProps =
  | { as?: undefined; href: string; tabIndex?: number; className?: string; children: ReactNode }
  | { as: "button"; onClick?: () => void; disabled?: boolean; tabIndex?: number; className?: string; children: ReactNode }

export function TextLink(props: TextLinkProps) {
  if (props.as === "button") {
    return (
      <button type="button" tabIndex={props.tabIndex} disabled={props.disabled} className={cn(linkClass, props.className)} onClick={props.onClick}>
        {props.children}
      </button>
    )
  }

  return (
    <Link href={props.href} tabIndex={props.tabIndex} className={cn(linkClass, props.className)}>
      {props.children}
    </Link>
  )
}
