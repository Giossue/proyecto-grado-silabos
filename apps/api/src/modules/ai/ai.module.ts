import { Module } from "@nestjs/common"
import { AssistantRepository } from "./assistant.repository"
import { AssistantService } from "./assistant.service"
import { ASSISTANT_RUNTIME, defaultAssistantRuntime } from "./assistant.tokens"
import { ProposalPreloader } from "./proposal.preloader"

@Module({
  providers: [AssistantRepository, AssistantService, ProposalPreloader, { provide: ASSISTANT_RUNTIME, useFactory: defaultAssistantRuntime }],
  exports: [AssistantRepository, AssistantService, ProposalPreloader, ASSISTANT_RUNTIME],
})
export class AiModule {}
