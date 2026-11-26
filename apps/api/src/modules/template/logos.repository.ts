import { Inject, Injectable } from "@nestjs/common"
import { PrismaService } from "../../prisma/prisma.service"
import { createLogoStore, type LogoStore, type StoredFaculty } from "../../server/shared/logoStore"

@Injectable()
export class LogosRepository implements LogoStore {
  private readonly store: LogoStore

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.store = createLogoStore(prisma)
  }

  faculty(id: string): Promise<StoredFaculty | null> {
    return this.store.faculty(id)
  }
}
