import { unmatchedRoute, unmatchedRouteHandler } from "@/server/http/router"
import { testSystemSettings } from "@/server/operations/systemSettingsWrites"

type Context = { params: Promise<{ section: string }> }

const SECTIONS = ["ia", "biblioteca"]

export async function POST(request: Request, context: Context): Promise<Response> {
  const { section } = await context.params
  return SECTIONS.includes(section) ? testSystemSettings(request, section) : unmatchedRoute(request)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
