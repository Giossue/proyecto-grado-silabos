import { Inject, Injectable } from "@nestjs/common"
import { PrismaService } from "../../prisma/prisma.service"
import { createAiReadPermissionStore, type AiReadPermissionStore } from "../../server/ai/readPermissionStore"

@Injectable()
export class AiPermissionsRepository {
  readonly store: AiReadPermissionStore

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.store = createAiReadPermissionStore(prisma)
  }
}
