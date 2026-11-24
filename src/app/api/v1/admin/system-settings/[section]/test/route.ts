import { laravelRouter, laravelRouterHandler } from "@/server/laravel/router"
import { testSystemSettings } from "@/server/operations/systemSettingsWrites"

type Context = { params: Promise<{ section: string }> }

const SECTIONS = ["ia", "biblioteca"]

export async function POST(request: Request, context: Context): Promise<Response> {
  const { section } = await context.params
  return SECTIONS.includes(section) ? testSystemSettings(request, section) : laravelRouter(request)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
