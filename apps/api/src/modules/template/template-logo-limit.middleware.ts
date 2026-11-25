import { Inject, Injectable, type NestMiddleware } from "@nestjs/common"
import type { NextFunction, Response } from "express"
import { type ApiRequest, webRequestOf } from "../../common/http/web-request"
import { sendWebResponse } from "../../common/http/web-response"
import { postTooLarge } from "../../server/files/uploads"
import { TEMPLATE_POST_LIMIT } from "./template.tokens"

@Injectable()
export class TemplateLogoLimitMiddleware implements NestMiddleware {
  constructor(@Inject(TEMPLATE_POST_LIMIT) private readonly limit: number) {}

  async use(request: ApiRequest, response: Response, next: NextFunction): Promise<void> {
    const tooLarge = request.method === "POST" ? postTooLarge(webRequestOf(request), this.limit) : null
    if (tooLarge === null) return next()
    await sendWebResponse(response, tooLarge)
  }
}
