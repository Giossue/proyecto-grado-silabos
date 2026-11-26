import { Module } from "@nestjs/common"
import { AcademicDeps } from "./academic-deps"
import { AdminAcademicController } from "./admin-academic.controller"
import { AdminCareerAcademicController } from "./admin-career-academic.controller"
import { CoordinationAcademicController } from "./coordination-academic.controller"
import { AcademicDeletionPrismaStore } from "./repositories/academic-deletion.store"
import { AcademicStructurePrismaRepository } from "./repositories/academic-structure.repository"
import { GovernancePrismaRepository } from "./repositories/governance.repository"
import { ScheduledSubjectsPrismaRepository } from "./repositories/scheduled-subjects.repository"
import { StructureImportPrismaStore } from "./repositories/structure-import.store"
import { SupportDocumentsPrismaRepository } from "./repositories/support-documents.repository"
import { SupportDocumentsController } from "./support-documents.controller"

export const ACADEMIC_CONTROLLERS = [AdminAcademicController, CoordinationAcademicController, AdminCareerAcademicController, SupportDocumentsController]

@Module({
  controllers: ACADEMIC_CONTROLLERS,
  providers: [
    AcademicDeps,
    GovernancePrismaRepository,
    AcademicStructurePrismaRepository,
    ScheduledSubjectsPrismaRepository,
    AcademicDeletionPrismaStore,
    SupportDocumentsPrismaRepository,
    StructureImportPrismaStore,
  ],
  exports: [AcademicDeps, AcademicStructurePrismaRepository, SupportDocumentsPrismaRepository],
})
export class AcademicModule {}
