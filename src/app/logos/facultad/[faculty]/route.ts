import { facultyLogo } from "@/server/configuration/logoRoutes"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ faculty: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { faculty } = await context.params
  return facultyLogo(request, faculty)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
