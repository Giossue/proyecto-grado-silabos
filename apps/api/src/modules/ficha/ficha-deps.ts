import { Inject, Injectable } from "@nestjs/common"
import { PrismaService } from "../../prisma/prisma.service"
import type { BridgeDeps } from "../../server/auth/types"
import { defaultSubjectProfileDeps, type SubjectProfileDeps } from "../../server/configuration/subjectProfile"
import { defaultSubjectPreviewDeps, type SubjectPreviewDeps } from "../../server/configuration/subjectProfilePreview"
import { defaultSubjectProfileWriteDeps, type SubjectProfileWriteDeps } from "../../server/configuration/subjectProfileWrites"
import type { FichaImportDeps } from "../../server/ficha/fichaImports"
import { createFichaImportDeps } from "../../server/ficha/fichaImportStore"
import type { RateLimiter } from "../../server/http/throttle"
import { AcademicStructurePrismaRepository } from "../academic/repositories/academic-structure.repository"
import { AUTH_BRIDGE, RATE_LIMITER } from "../auth/auth.tokens"

@Injectable()
export class FichaDeps {
  constructor(
    @Inject(AUTH_BRIDGE) private readonly bridge: BridgeDeps,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AcademicStructurePrismaRepository) private readonly structure: AcademicStructurePrismaRepository,
  ) {}

  private careerActive = async (careerId: string): Promise<boolean> => (await this.structure.activeCareer(careerId)) !== null

  imports(): FichaImportDeps {
    return { ...createFichaImportDeps(this.prisma), bridge: this.bridge, limiter: this.limiter }
  }

  profile(): SubjectProfileDeps {
    return { ...defaultSubjectProfileDeps(this.prisma), bridge: this.bridge, careerActive: this.careerActive }
  }

  profileWrites(): SubjectProfileWriteDeps {
    return { ...defaultSubjectProfileWriteDeps(this.prisma), bridge: this.bridge, careerActive: this.careerActive }
  }

  preview(): SubjectPreviewDeps {
    return { ...defaultSubjectPreviewDeps(this.prisma), bridge: this.bridge, careerActive: this.careerActive }
  }
}
