import { unmatchedRoute, unmatchedRouteHandler } from "@/server/http/router"
import { updateSystemSettings } from "@/server/operations/systemSettingsWrites"

type Context = { params: Promise<{ section: string }> }

const SECTIONS = ["notificaciones", "ia", "biblioteca"]

export async function PUT(request: Request, context: Context): Promise<Response> {
  const { section } = await context.params
  return SECTIONS.includes(section) ? updateSystemSettings(request, section) : unmatchedRoute(request)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as POST, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
