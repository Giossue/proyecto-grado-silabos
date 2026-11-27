import { Inject, Injectable } from "@nestjs/common"
import { PrismaService } from "../../prisma/prisma.service"
import type { BridgeDeps } from "../../server/auth/types"
import { defaultSubjectProfileDeps, type SubjectProfileDeps } from "../../server/configuration/subjectProfile"
import type { SubjectProfileBulkDeps } from "../../server/configuration/subjectProfileBulk"
import { careerSyllabusSubjects } from "../../server/configuration/subjectProfileBulkStore"
import { defaultSubjectPreviewDeps, type SubjectPreviewDeps } from "../../server/configuration/subjectProfilePreview"
import { defaultSubjectProfileWriteDeps, type SubjectProfileWriteDeps } from "../../server/configuration/subjectProfileWrites"
import { AcademicStructurePrismaRepository } from "../academic/repositories/academic-structure.repository"
import { AUTH_BRIDGE } from "../auth/auth.tokens"

@Injectable()
export class FichaDeps {
  constructor(
    @Inject(AUTH_BRIDGE) private readonly bridge: BridgeDeps,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AcademicStructurePrismaRepository) private readonly structure: AcademicStructurePrismaRepository,
  ) {}

  private careerActive = async (careerId: string): Promise<boolean> => (await this.structure.activeCareer(careerId)) !== null

  profile(): SubjectProfileDeps {
    return { ...defaultSubjectProfileDeps(this.prisma), bridge: this.bridge, careerActive: this.careerActive }
  }

  profileWrites(): SubjectProfileWriteDeps {
    return { ...defaultSubjectProfileWriteDeps(this.prisma), bridge: this.bridge, careerActive: this.careerActive }
  }

  bulk(): SubjectProfileBulkDeps {
    return { ...this.profileWrites(), careerSubjects: (careerId) => careerSyllabusSubjects(this.prisma, careerId) }
  }

  preview(): SubjectPreviewDeps {
    return { ...defaultSubjectPreviewDeps(this.prisma), bridge: this.bridge, careerActive: this.careerActive }
  }
}
