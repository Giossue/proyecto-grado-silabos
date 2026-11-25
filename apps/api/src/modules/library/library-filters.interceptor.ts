import { type CallHandler, type ExecutionContext, Inject, Injectable, type NestInterceptor } from "@nestjs/common"
import { Observable } from "rxjs"
import { runWithValidationContext } from "../../common/context/validation-context"
import { ResponseException } from "../../common/exceptions/response.exception"
import { jsonError } from "../../server/http/responses"
import { existenceCheck } from "../../server/library/reviews"
import { LibraryReviewsRepository } from "./library-reviews.repository"

export const LIBRARY_FILTER_EXISTS = "libraryFilterExists"

@Injectable()
export class LibraryFiltersInterceptor implements NestInterceptor {
  constructor(@Inject(LibraryReviewsRepository) private readonly reviews: LibraryReviewsRepository) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const exists = existenceCheck(this.reviews, () => new ResponseException(jsonError(500, "Server Error")))
    return new Observable<unknown>((subscriber) => runWithValidationContext({ [LIBRARY_FILTER_EXISTS]: exists }, () => next.handle().subscribe(subscriber)))
  }
}
