import { importCareers } from "@/server/academic/structureImports"
import { unmatchedRouteHandler } from "@/server/http/router"
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

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as PUT, unmatchedRouteHandler as OPTIONS }
