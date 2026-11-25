import { publicSyllabusImage } from "@/server/configuration/logoRoutes"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ file: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { file } = await context.params
  return publicSyllabusImage(request, file)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
