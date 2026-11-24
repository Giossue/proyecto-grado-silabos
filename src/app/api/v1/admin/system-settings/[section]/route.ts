import { laravelRouter, laravelRouterHandler } from "@/server/laravel/router"
import { updateSystemSettings } from "@/server/operations/systemSettingsWrites"

type Context = { params: Promise<{ section: string }> }

const SECTIONS = ["notificaciones", "ia", "biblioteca"]

export async function PUT(request: Request, context: Context): Promise<Response> {
  const { section } = await context.params
  return SECTIONS.includes(section) ? updateSystemSettings(request, section) : laravelRouter(request)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as POST, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
