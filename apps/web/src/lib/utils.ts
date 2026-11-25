export { cn } from "cn"

export const withoutFinalPeriod = (text: string): string => text.replace(/\.\s*$/, "")

export type NavigableHref = string | { url: string }

export function toUrl(href: NavigableHref) {
  return typeof href === "string" ? href : href?.url
}
