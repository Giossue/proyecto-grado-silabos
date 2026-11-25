import { Inject, Injectable } from "@nestjs/common"
import type { StoredProposal } from "../../server/ai/assistantStore"
import {
  applyProposalOf,
  clearAssistantOf,
  discardProposalOf,
  showAssistantOf,
  showProposalOf,
  storeAssistantMessageOf,
  type AssistantRouteDeps,
} from "../../server/ai/assistantRoutes"
import type { AppSession, BridgeDeps } from "../../server/auth/types"
import type { PhpArray } from "../../server/http/input"
import { AUTH_BRIDGE } from "../auth/auth.tokens"
import { AssistantRepository } from "./assistant.repository"
import { ASSISTANT_RUNTIME, type AssistantRuntime } from "./assistant.tokens"

@Injectable()
export class AssistantService {
  constructor(
    @Inject(AssistantRepository) private readonly assistant: AssistantRepository,
    @Inject(ASSISTANT_RUNTIME) private readonly runtime: AssistantRuntime,
    @Inject(AUTH_BRIDGE) private readonly bridge: BridgeDeps,
  ) {}

  private deps(): AssistantRouteDeps {
    return { bridge: this.bridge, store: this.assistant.store, ...this.runtime }
  }

  show(session: AppSession): Promise<Response> {
    return showAssistantOf(session, this.deps())
  }

  sendMessage(input: PhpArray, session: AppSession): Promise<Response> {
    return storeAssistantMessageOf(input, session, this.deps())
  }

  clear(session: AppSession): Promise<Response> {
    return clearAssistantOf(session, this.deps())
  }

  proposal(session: AppSession, proposal: StoredProposal): Response {
    return showProposalOf(session, proposal)
  }

  apply(session: AppSession, proposal: StoredProposal): Promise<Response> {
    return applyProposalOf(session, proposal, this.deps())
  }

  discard(session: AppSession, proposal: StoredProposal): Promise<Response> {
    return discardProposalOf(session, proposal, this.deps())
  }
}
