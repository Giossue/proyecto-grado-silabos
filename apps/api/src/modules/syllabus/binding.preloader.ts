import { Inject, Injectable, type Type } from "@nestjs/common"
import type { SessionPreloader } from "../../common/decorators/authenticated.options"
import type { SessionRequest } from "../../common/http/session-request"
import type { SessionUser } from "../../server/auth/types"
import type { Binder } from "../../server/syllabus/boundSession"

export type RouteParams = Record<string, string>

export function bindingPreloader<D>(token: symbol, binderOf: (deps: D, params: RouteParams) => Binder<unknown>): Type<SessionPreloader> {
  @Injectable()
  class BindingPreloader implements SessionPreloader {
    constructor(@Inject(token) private readonly deps: D) {}

    async load(_request: Request, user: SessionUser, http: SessionRequest): Promise<Response | null> {
      const outcome = await binderOf(this.deps, http.params as RouteParams)(user)
      if (outcome instanceof Response) return outcome
      http.preloaded = outcome
      return null
    }
  }
  return BindingPreloader
}
