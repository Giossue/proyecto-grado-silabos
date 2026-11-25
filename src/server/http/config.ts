import "server-only"

export function strSlug(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/@/g, "-at-")
    .replace(/[^-\p{L}\p{N}\s]+/gu, "")
    .replace(/[-\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
}

export function appKey(): string {
  const key = process.env.APP_KEY
  if (!key) throw new Error("APP_KEY is not configured.")
  return key
}
