import { Inject, Injectable } from "@nestjs/common"
import type { BridgeDeps } from "../../server/auth/types"
import { defaultSubjectProfileDeps, type SubjectProfileDeps } from "../../server/configuration/subjectProfile"
import { defaultSubjectPreviewDeps, type SubjectPreviewDeps } from "../../server/configuration/subjectProfilePreview"
import { defaultSubjectProfileWriteDeps, type SubjectProfileWriteDeps } from "../../server/configuration/subjectProfileWrites"
import type { FichaImportDeps } from "../../server/ficha/fichaImports"
import { createFichaImportDeps } from "../../server/ficha/fichaImportStore"
import type { RateLimiter } from "../../server/http/throttle"
import { AcademicStructurePrismaRepository } from "../academic/repositories/academic-structure.repository"
import { AUTH_BRIDGE, RATE_LIMITER } from "../auth/auth.tokens"
import { FichaImportStoreFactory } from "./ficha-import.store"

@Injectable()
export class FichaDeps {
  constructor(
    @Inject(AUTH_BRIDGE) private readonly bridge: BridgeDeps,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    @Inject(FichaImportStoreFactory) private readonly stores: FichaImportStoreFactory,
    @Inject(AcademicStructurePrismaRepository) private readonly structure: AcademicStructurePrismaRepository,
  ) {}

  private careerActive = async (careerId: string): Promise<boolean> => (await this.structure.activeCareer(careerId)) !== null

  imports(): FichaImportDeps {
    const drizzle = createFichaImportDeps()
    return { ...drizzle, store: this.stores.create(drizzle.store), bridge: this.bridge, limiter: this.limiter }
  }

  profile(): SubjectProfileDeps {
    return { ...defaultSubjectProfileDeps(), bridge: this.bridge, careerActive: this.careerActive }
  }

  profileWrites(): SubjectProfileWriteDeps {
    return { ...defaultSubjectProfileWriteDeps(), bridge: this.bridge, careerActive: this.careerActive }
  }

  preview(): SubjectPreviewDeps {
    return { ...defaultSubjectPreviewDeps(), bridge: this.bridge, careerActive: this.careerActive }
  }
}
