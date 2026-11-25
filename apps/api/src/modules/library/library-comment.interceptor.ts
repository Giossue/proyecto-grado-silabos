import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from "@nestjs/common"
import type { Observable } from "rxjs"
import { ResponseException } from "../../common/exceptions/response.exception"
import type { SessionRequest } from "../../common/http/session-request"
import type { AppSession } from "../../server/auth/types"
import { commentRefusal, type BoundRevision } from "../../server/library/reviewDecisions"

@Injectable()
export class LibraryCommentInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<SessionRequest>()
    const refusal = commentRefusal(request.appSession as AppSession, (request.preloaded as BoundRevision).syllabus)
    if (refusal !== null) throw new ResponseException(refusal)
    return next.handle()
  }
}
