import { Inject, Injectable } from "@nestjs/common"
import type { CareerWriteDeps } from "../../server/academic/careerWrites"
import { createCareerWriteDeps, createCurriculumDeps } from "../../server/academic/careerWriteStore"
import type { CurriculumDeps } from "../../server/academic/curriculumWrites"
import type { AcademicDeletionDeps } from "../../server/academic/deletions"
import type { GovernanceDeps } from "../../server/academic/governance"
import type { GovernanceWriteDeps } from "../../server/academic/governanceWrites"
import { createGovernanceWriteDeps } from "../../server/academic/governanceWriteStore"
import type { ScheduledSubjectsDeps } from "../../server/academic/scheduledSubjects"
import type { AcademicStructureDeps } from "../../server/academic/structure"
import type { StructureImportDeps } from "../../server/academic/structureImports"
import { createStructureImportTransactions } from "../../server/academic/structureImportStore"
import type { SupportDocumentDeps } from "../../server/academic/supportDocuments"
import { dispatchSupportDocumentView } from "../../server/academic/supportDocumentViewJob"
import { defaultSupportDocumentWriteDeps, type SupportDocumentWriteDeps } from "../../server/academic/supportDocumentWrites"
import type { BridgeDeps } from "../../server/auth/types"
import { createTemplateStore } from "../../server/configuration/templateStore"
import { institutionToday } from "../../server/dashboard/dashboardQueries"
import type { RateLimiter } from "../../server/http/throttle"
import { defaultIdentityWriteDeps, type IdentityWriteDeps } from "../../server/identity/accountWrites"
import { defaultIdentityImportDeps, type IdentityImportDeps } from "../../server/identity/imports"
import { type CatalogDeps, defaultCatalogDeps } from "../../server/library/catalogHandlers"
import { AUTH_BRIDGE, RATE_LIMITER } from "../auth/auth.tokens"
import { AcademicDeletionPrismaStore } from "./repositories/academic-deletion.store"
import { AcademicStructurePrismaRepository } from "./repositories/academic-structure.repository"
import { GovernancePrismaRepository } from "./repositories/governance.repository"
import { ScheduledSubjectsPrismaRepository } from "./repositories/scheduled-subjects.repository"
import { StructureImportPrismaStore } from "./repositories/structure-import.store"
import { SupportDocumentsPrismaRepository } from "./repositories/support-documents.repository"

@Injectable()
export class AcademicDeps {
  constructor(
    @Inject(AUTH_BRIDGE) private readonly bridge: BridgeDeps,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    @Inject(GovernancePrismaRepository) private readonly governanceRepository: GovernancePrismaRepository,
    @Inject(AcademicStructurePrismaRepository) private readonly structureRepository: AcademicStructurePrismaRepository,
    @Inject(ScheduledSubjectsPrismaRepository) private readonly scheduledRepository: ScheduledSubjectsPrismaRepository,
    @Inject(AcademicDeletionPrismaStore) private readonly deletionStore: AcademicDeletionPrismaStore,
    @Inject(SupportDocumentsPrismaRepository) private readonly supportDocumentsRepository: SupportDocumentsPrismaRepository,
    @Inject(StructureImportPrismaStore) private readonly structureImportStore: StructureImportPrismaStore,
  ) {}

  governance(): GovernanceDeps {
    return { bridge: this.bridge, governance: this.governanceRepository, today: institutionToday }
  }

  deletions(): AcademicDeletionDeps {
    return { bridge: this.bridge, store: this.deletionStore }
  }

  governanceWrites(): GovernanceWriteDeps {
    return { ...createGovernanceWriteDeps(), bridge: this.bridge, deletions: this.deletions() }
  }

  structureImports(): StructureImportDeps {
    return { bridge: this.bridge, limiter: this.limiter, store: this.structureImportStore, ...createStructureImportTransactions() }
  }

  structure(): AcademicStructureDeps {
    return { bridge: this.bridge, academic: this.structureRepository }
  }

  scheduled(): ScheduledSubjectsDeps {
    return { ...this.structure(), scheduled: this.scheduledRepository, templates: createTemplateStore() }
  }

  careerWrites(): CareerWriteDeps {
    return { ...createCareerWriteDeps(), bridge: this.bridge }
  }

  curriculum(): CurriculumDeps {
    return { ...createCurriculumDeps(), bridge: this.bridge }
  }

  supportDocuments(): SupportDocumentDeps {
    return { bridge: this.bridge, documents: this.supportDocumentsRepository }
  }

  supportDocumentWrites(): SupportDocumentWriteDeps {
    return { ...defaultSupportDocumentWriteDeps(this.supportDocumentsRepository, dispatchSupportDocumentView), bridge: this.bridge, limiter: this.limiter }
  }

  careerTeachers(): IdentityWriteDeps {
    return { ...defaultIdentityWriteDeps(), bridge: this.bridge, limiter: this.limiter }
  }

  teacherImports(): IdentityImportDeps {
    return { ...defaultIdentityImportDeps(), bridge: this.bridge, limiter: this.limiter }
  }

  catalog(): CatalogDeps {
    return { ...defaultCatalogDeps(), bridge: this.bridge, limiter: this.limiter }
  }
}
