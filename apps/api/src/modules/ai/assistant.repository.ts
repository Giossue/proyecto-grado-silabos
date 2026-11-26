import { Inject, Injectable } from "@nestjs/common"
import { PrismaService } from "../../prisma/prisma.service"
import { type AssistantStore, createAssistantStore } from "../../server/ai/assistantStore"

@Injectable()
export class AssistantRepository {
  readonly store: AssistantStore

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.store = createAssistantStore(prisma)
  }
}
