import { type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common"
import { PhpInputMiddleware } from "../../common/middleware/php-input.middleware"
import { PrismaService } from "../../prisma/prisma.service"
import { createLibraryDecisionDeps } from "../../server/library/reviewDecisionStore"
import { createLogoStore } from "../../server/shared/logoStore"
import { signatureSettings } from "../../server/signatures/cmsVerifier"
import { reviewDetailStoreOn } from "../../server/syllabus/reviewDetailQueries"
import { LibraryCommentInterceptor } from "./library-comment.interceptor"
import { LibraryFiltersInterceptor } from "./library-filters.interceptor"
import { LibraryDecisionPreloader, LibraryRevisionPreloader } from "./library-revision.preloader"
import { LibraryReviewsRepository } from "./library-reviews.repository"
import { LibraryController } from "./library.controller"
import { LibraryService } from "./library.service"
import { LIBRARY_DECISIONS, LIBRARY_DETAIL_STORE, LIBRARY_LOGO_STORE, LIBRARY_SYLLABUS_STORE } from "./library.tokens"
import { syllabusDetailStoreOn } from "../../server/syllabus/syllabusDetailQueries"

@Module({
  controllers: [LibraryController],
  providers: [
    LibraryReviewsRepository,
    { provide: LIBRARY_DETAIL_STORE, useFactory: (prisma: PrismaService) => reviewDetailStoreOn(prisma), inject: [PrismaService] },
    { provide: LIBRARY_SYLLABUS_STORE, useFactory: (prisma: PrismaService) => syllabusDetailStoreOn(prisma), inject: [PrismaService] },
    { provide: LIBRARY_LOGO_STORE, useFactory: (prisma: PrismaService) => createLogoStore(prisma), inject: [PrismaService] },
    { provide: LIBRARY_DECISIONS, useFactory: (prisma: PrismaService) => ({ settings: () => signatureSettings(), ...createLibraryDecisionDeps(prisma) }), inject: [PrismaService] },
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
