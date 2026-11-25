import { unmatchedRouteHandler } from "@/server/http/router"
import { showEmailPreferences, updateEmailPreferences } from "@/server/operations/emailPreferences"

export function GET(request: Request): Promise<Response> {
  return showEmailPreferences(request)
}

export function PUT(request: Request): Promise<Response> {
  return updateEmailPreferences(request)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
