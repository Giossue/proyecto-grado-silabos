import { getCoordinationSupportDocuments, getTeacherSupportDocuments } from "@/api/support-documents"

export const supportDocumentKeys = {
  all: ["support-documents"] as const,
  teacher: () => ["support-documents", "teacher"] as const,
  coordination: () => ["support-documents", "coordination"] as const,
}

export const teacherSupportDocumentsQuery = () => ({ queryKey: supportDocumentKeys.teacher(), queryFn: getTeacherSupportDocuments })

export const coordinationSupportDocumentsQuery = () => ({ queryKey: supportDocumentKeys.coordination(), queryFn: getCoordinationSupportDocuments })
