import { laravelRouterHandler } from "@/server/laravel/router"
import { listAuditEvents } from "@/server/operations/auditEvents"

export function GET(request: Request): Promise<Response> {
  return listAuditEvents(request)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
