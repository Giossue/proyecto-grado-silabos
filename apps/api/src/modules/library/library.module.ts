import { type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common"
import { PhpInputMiddleware } from "../../common/middleware/php-input.middleware"
import { createLogoStore } from "../../server/configuration/institutionalLogos"
import { createLibraryDecisionDeps } from "../../server/library/reviewDecisionStore"
import { signatureSettings } from "../../server/signatures/cmsVerifier"
import { createReviewDetailStore } from "../../server/syllabus/reviewDetailQueries"
import { LibraryCommentInterceptor } from "./library-comment.interceptor"
import { LibraryFiltersInterceptor } from "./library-filters.interceptor"
import { LibraryDecisionPreloader, LibraryRevisionPreloader } from "./library-revision.preloader"
import { LibraryReviewsRepository } from "./library-reviews.repository"
import { LibraryController } from "./library.controller"
import { LibraryService } from "./library.service"
import { LIBRARY_DECISIONS, LIBRARY_DETAIL_STORE, LIBRARY_LOGO_STORE } from "./library.tokens"

@Module({
  controllers: [LibraryController],
  providers: [
    LibraryReviewsRepository,
    { provide: LIBRARY_DETAIL_STORE, useFactory: createReviewDetailStore },
    { provide: LIBRARY_LOGO_STORE, useFactory: () => createLogoStore() },
    { provide: LIBRARY_DECISIONS, useFactory: () => ({ settings: () => signatureSettings(), ...createLibraryDecisionDeps() }) },
    LibraryService,
    LibraryRevisionPreloader,
    LibraryDecisionPreloader,
    LibraryFiltersInterceptor,
    LibraryCommentInterceptor,
  ],
})
export class LibraryModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(PhpInputMiddleware).forRoutes(LibraryController)
  }
}
