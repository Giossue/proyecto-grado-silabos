import { Inject, Injectable } from "@nestjs/common"
import type { PageLinks } from "../../common/decorators/query-input.decorator"
import type { AppSession, BridgeDeps } from "../../server/auth/types"
import type { LogoStore } from "../../server/shared/logoStore"
import type { PhpArray } from "../../server/http/input"
import { commentBoundRevision, verifyBoundRevision, type BoundRevision, type LibraryDecisionDeps } from "../../server/library/reviewDecisions"
import { libraryReviewPayload } from "../../server/library/reviewDetail"
import { historyListing, reviewsListing } from "../../server/library/reviews"
import type { ReviewDetailStore, ReviewRevision } from "../../server/syllabus/reviewDetails"
import { AUTH_BRIDGE } from "../auth/auth.tokens"
import { LibraryReviewsRepository } from "./library-reviews.repository"
import type { LibraryReviewDetailDeps } from "../../server/library/reviewDetail"
import { LIBRARY_DECISIONS, LIBRARY_DETAIL_STORE, LIBRARY_LOGO_STORE, LIBRARY_SYLLABUS_STORE } from "./library.tokens"

const phpInput = (value: object): PhpArray => value as PhpArray

@Injectable()
export class LibraryService {
  constructor(
    @Inject(LibraryReviewsRepository) private readonly reviews: LibraryReviewsRepository,
    @Inject(LIBRARY_DETAIL_STORE) private readonly store: ReviewDetailStore,
    @Inject(LIBRARY_LOGO_STORE) private readonly logos: LogoStore,
    @Inject(LIBRARY_SYLLABUS_STORE) private readonly syllabusStore: LibraryReviewDetailDeps["syllabusStore"],
    @Inject(LIBRARY_DECISIONS) private readonly decisions: Omit<LibraryDecisionDeps, "bridge">,
    @Inject(AUTH_BRIDGE) private readonly bridge: BridgeDeps,
  ) {}

  reviewsList(links: PageLinks, filters: object) {
    return reviewsListing(this.reviews, links, phpInput(filters))
  }

  history(links: PageLinks, session: AppSession, filters: object) {
    return historyListing(this.reviews, links, session, phpInput(filters))
  }

  detail(request: Request, session: AppSession, revision: ReviewRevision): Promise<Response> {
    return libraryReviewPayload(request, session, revision, { store: this.store, libraryReviews: this.reviews, logos: this.logos, syllabusStore: this.syllabusStore })
  }

  verify(request: Request, session: AppSession, bound: BoundRevision, input: object): Promise<Response> {
    return verifyBoundRevision(request, session, bound, phpInput(input), { bridge: this.bridge, ...this.decisions })
  }

  comment(request: Request, session: AppSession, bound: BoundRevision, input: object): Promise<Response> {
    return commentBoundRevision(request, session, bound, phpInput(input), { bridge: this.bridge, ...this.decisions })
  }
}
