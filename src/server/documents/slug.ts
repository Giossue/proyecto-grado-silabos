import { ascii } from "../signatures/holderMatcher"

export function laravelSlug(title: string): string {
  return ascii(title)
    .replace(/_+/gu, "-")
    .replaceAll("@", "-at-")
    .toLowerCase()
    .replace(/[^-\p{L}\p{N}\s]+/gu, "")
    .replace(/[-\s]+/gu, "-")
    .replace(/^-+|-+$/g, "")
}
