import { Inject, Injectable } from "@nestjs/common"
import type { SessionPreloader } from "../../common/decorators/authenticated.options"
import type { SessionRequest } from "../../common/http/session-request"
import { findProposal, proposalNotFound } from "../../server/ai/assistantRoutes"
import { AssistantRepository } from "./assistant.repository"

@Injectable()
export class ProposalPreloader implements SessionPreloader {
  constructor(@Inject(AssistantRepository) private readonly assistant: AssistantRepository) {}

  async load(_request: Request, _user: unknown, http: SessionRequest): Promise<Response | null> {
    const id = String(http.params.proposal ?? "")
    const proposal = await findProposal(id, this.assistant.store)
    if (proposal === null) return proposalNotFound(id)
    http.preloaded = proposal
    return null
  }
}
