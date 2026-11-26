import { toast } from "@/lib/toast"

export const purgeMessageOf = (errors: Record<string, string[] | undefined>): string | undefined => errors.purge_required?.[0]

export const announcePurge = (message: string): void => {
  toast.info(message)
}
