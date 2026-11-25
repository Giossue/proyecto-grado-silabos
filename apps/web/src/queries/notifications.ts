import { queryOptions, type QueryClient } from "@tanstack/react-query"
import { getNotifications } from "@/api/notifications"

export type NotificationStatus = "all" | "unread"

export const notificationKeys = {
  all: ["notifications"] as const,
  unreadCount: () => ["notifications", "unread-count"] as const,
  previews: () => ["notifications", "preview"] as const,
  preview: (status: NotificationStatus) => ["notifications", "preview", status] as const,
  page: (status: NotificationStatus, page: number) => ["notifications", "page", status, page] as const,
}

export const unreadCountQuery = () =>
  queryOptions({
    queryKey: notificationKeys.unreadCount(),
    queryFn: () => getNotifications("unread").then((result) => result.unread_count, () => 0),
  })

export const notificationPreviewQuery = (client: QueryClient, status: NotificationStatus) =>
  queryOptions({
    queryKey: notificationKeys.preview(status),
    queryFn: async () => {
      const result = await getNotifications(status)
      client.setQueryData(notificationKeys.unreadCount(), result.unread_count)

      return result
    },
  })

export const notificationPageQuery = (status: NotificationStatus, page: number) =>
  queryOptions({ queryKey: notificationKeys.page(status, page), queryFn: () => getNotifications(status, page) })
