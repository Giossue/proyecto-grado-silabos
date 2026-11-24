import { laravelRouterHandler } from "@/server/laravel/router"
import { showEmailPreferences, updateEmailPreferences } from "@/server/operations/emailPreferences"

export function GET(request: Request): Promise<Response> {
  return showEmailPreferences(request)
}

export function PUT(request: Request): Promise<Response> {
  return updateEmailPreferences(request)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
