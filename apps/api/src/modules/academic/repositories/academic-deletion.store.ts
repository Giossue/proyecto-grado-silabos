import { Inject, Injectable } from "@nestjs/common"
import { PrismaService } from "../../../prisma/prisma.service"
import { deletionTx, type AcademicDeletionStore, type DeletionTx } from "../../../server/academic/deletions"
import { inTransaction } from "../../../prisma/db"
import { AcademicStructurePrismaRepository } from "./academic-structure.repository"

@Injectable()
export class AcademicDeletionPrismaStore implements AcademicDeletionStore {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AcademicStructurePrismaRepository) private readonly structure: AcademicStructurePrismaRepository,
  ) {}

  async careerActive(careerId: string): Promise<boolean> {
    return (await this.structure.activeCareer(careerId)) !== null
  }

  transaction<T>(work: (tx: DeletionTx) => Promise<T>): Promise<T> {
    return inTransaction(this.prisma, (tx) => work(deletionTx(tx)))
  }
}
