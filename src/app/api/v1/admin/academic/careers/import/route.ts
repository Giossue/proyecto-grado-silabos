import { importCareers } from "@/server/academic/structureImports"
import { laravelRouterHandler } from "@/server/laravel/router"
import { deleteGovernanceRecord } from "@/server/academic/deletions"
import { updateGovernanceRecord } from "@/server/academic/governanceWrites"

export function POST(request: Request): Promise<Response> {
  return importCareers(request)
}

export function PATCH(request: Request): Promise<Response> {
  return updateGovernanceRecord(request, "careers", "import")
}

export function DELETE(request: Request): Promise<Response> {
  return deleteGovernanceRecord(request, "careers", "import")
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as PUT, laravelRouterHandler as OPTIONS }
