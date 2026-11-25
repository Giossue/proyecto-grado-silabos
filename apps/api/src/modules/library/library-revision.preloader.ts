import { Inject, Injectable } from "@nestjs/common"
import type { SessionPreloader } from "../../common/decorators/authenticated.options"
import type { SessionRequest } from "../../common/http/session-request"
import { isUuid } from "../../server/academic/structure"
import type { SessionUser } from "../../server/auth/types"
import { MODELS } from "../../server/http/models"
import { modelNotFound } from "../../server/http/router"
import { loadBoundRevision } from "../../server/library/reviewDecisions"
import type { ReviewDetailStore } from "../../server/syllabus/reviewDetails"
import { LIBRARY_DETAIL_STORE } from "./library.tokens"

const revisionParameter = (http: SessionRequest): string => String(http.params.revision ?? "")

@Injectable()
export class LibraryRevisionPreloader implements SessionPreloader {
  constructor(@Inject(LIBRARY_DETAIL_STORE) private readonly store: ReviewDetailStore) {}

  async load(_request: Request, _user: SessionUser, http: SessionRequest): Promise<Response | null> {
    const id = revisionParameter(http)
    const revision = isUuid(id) ? await this.store.revision(id) : null
    if (revision === null) return modelNotFound(MODELS.revision, id)
    http.preloaded = revision
    return null
  }
}

@Injectable()
export class LibraryDecisionPreloader implements SessionPreloader {
  constructor(@Inject(LIBRARY_DETAIL_STORE) private readonly store: ReviewDetailStore) {}

  async load(_request: Request, user: SessionUser, http: SessionRequest): Promise<Response | null> {
    const id = revisionParameter(http)
    const bound = await loadBoundRevision(this.store, id, user.id)
    if (bound === null) return modelNotFound(MODELS.revision, id)
    http.preloaded = bound
    return null
  }
}
