import { careerImportTemplate } from "@/server/academic/structureImports"
import { unmatchedRouteHandler } from "@/server/http/router"
import { deleteGovernanceRecord } from "@/server/academic/deletions"
import { updateGovernanceRecord } from "@/server/academic/governanceWrites"

export function GET(request: Request): Promise<Response> {
  return careerImportTemplate(request)
}

export function PATCH(request: Request): Promise<Response> {
  return updateGovernanceRecord(request, "careers", "import-template")
}

export function DELETE(request: Request): Promise<Response> {
  return deleteGovernanceRecord(request, "careers", "import-template")
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as OPTIONS }
