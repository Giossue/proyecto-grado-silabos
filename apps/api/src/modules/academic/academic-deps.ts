import { Inject, Injectable } from "@nestjs/common"
import { PrismaService } from "../../prisma/prisma.service"
import type { CareerWriteDeps } from "../../server/academic/careerWrites"
import { createCareerWriteDeps, createCurriculumDeps } from "../../server/academic/careerWriteStore"
import type { CurriculumDeps } from "../../server/academic/curriculumWrites"
import type { AcademicDeletionDeps } from "../../server/academic/deletions"
import type { GovernanceDeps } from "../../server/academic/governance"
import type { GovernanceWriteDeps } from "../../server/academic/governanceWrites"
import { createGovernanceWriteDeps } from "../../server/academic/governanceWriteStore"
import type { ScheduledSubjectsDeps } from "../../server/academic/scheduledSubjects"
import type { CurriculumReadDeps } from "../../server/academic/structure"
import type { MallaDeps } from "../../server/academic/mallas"
import { createMallaDeps } from "../../server/academic/mallaWriteStore"
import type { StructureImportDeps } from "../../server/academic/structureImports"
import { createStructureImportTransactions } from "../../server/academic/structureImportStore"
import type { SupportDocumentDeps } from "../../server/academic/supportDocuments"
import { dispatchSupportDocumentView } from "../../server/academic/supportDocumentViewJob"
import { defaultSupportDocumentWriteDeps, type SupportDocumentWriteDeps } from "../../server/academic/supportDocumentWrites"
import type { BridgeDeps } from "../../server/auth/types"
import { careerProfileBlock } from "../../server/configuration/subjectProfile"
import { institutionToday } from "../../server/shared/clock"
import { createTemplateStore } from "../../server/shared/templateStore"
import type { RateLimiter } from "../../server/http/throttle"
import type { IdentityWriteDeps } from "../../server/identity/accountWrites"
import type { IdentityImportDeps } from "../../server/identity/imports"
import { type CatalogDeps, defaultCatalogDeps } from "../../server/library/catalogHandlers"
import { AUTH_BRIDGE, RATE_LIMITER } from "../auth/auth.tokens"
import { IdentityDeps } from "../auth/identity.deps"
import { IDENTITY_RUNTIME, type IdentityRuntime } from "../auth/identity.runtime"
import { identityImportStoreOn } from "../users/repositories/identity-import.repository"
import { AcademicDeletionPrismaStore } from "./repositories/academic-deletion.store"
import { AcademicStructurePrismaRepository } from "./repositories/academic-structure.repository"
import { GovernancePrismaRepository } from "./repositories/governance.repository"
import { ScheduledSubjectsPrismaRepository } from "./repositories/scheduled-subjects.repository"
import { StructureImportPrismaStore } from "./repositories/structure-import.store"
import { SupportDocumentsPrismaRepository } from "./repositories/support-documents.repository"

@Injectable()
export class AcademicDeps {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AUTH_BRIDGE) private readonly bridge: BridgeDeps,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    @Inject(IdentityDeps) private readonly identity: IdentityDeps,
    @Inject(IDENTITY_RUNTIME) private readonly runtime: IdentityRuntime,
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
    return { ...createGovernanceWriteDeps(this.prisma), bridge: this.bridge, deletions: this.deletions() }
  }

  structureImports(): StructureImportDeps {
    return { bridge: this.bridge, limiter: this.limiter, store: this.structureImportStore, ...createStructureImportTransactions(this.prisma) }
  }

  structure(): CurriculumReadDeps {
    return { bridge: this.bridge, academic: this.structureRepository, mallas: this.structureRepository }
  }

  mallas(): MallaDeps {
    return { ...createMallaDeps(this.prisma, this.structureRepository), bridge: this.bridge }
  }

  scheduled(): ScheduledSubjectsDeps {
    return {
      ...this.structure(),
      scheduled: this.scheduledRepository,
      templates: createTemplateStore(this.prisma),
      careerProfileBlock: (careerId) => careerProfileBlock(this.prisma, careerId),
    }
  }

  careerWrites(): CareerWriteDeps {
    return { ...createCareerWriteDeps(this.prisma), bridge: this.bridge }
  }

  curriculum(): CurriculumDeps {
    return { ...createCurriculumDeps(this.prisma), bridge: this.bridge }
  }

  supportDocuments(): SupportDocumentDeps {
    return { bridge: this.bridge, documents: this.supportDocumentsRepository }
  }

  supportDocumentWrites(): SupportDocumentWriteDeps {
    return { ...defaultSupportDocumentWriteDeps(this.supportDocumentsRepository, dispatchSupportDocumentView), bridge: this.bridge, limiter: this.limiter }
  }

  careerTeachers(): IdentityWriteDeps {
    return { ...this.identity.set.writes, bridge: this.bridge, limiter: this.limiter }
  }

  teacherImports(): IdentityImportDeps {
    return { ...this.identity.set.writes, store: identityImportStoreOn(this.prisma), now: this.runtime.now, bridge: this.bridge, limiter: this.limiter }
  }

  catalog(): CatalogDeps {
    return { ...defaultCatalogDeps(this.prisma), bridge: this.bridge, limiter: this.limiter }
  }
}
