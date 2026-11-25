import { Injectable, type NestMiddleware } from "@nestjs/common"
import type { NextFunction, Response } from "express"
import { requestInput } from "../../server/http/input"
import { type ApiRequest, webRequestOf } from "../http/web-request"

@Injectable()
export class PhpInputMiddleware implements NestMiddleware {
  async use(request: ApiRequest, _response: Response, next: NextFunction): Promise<void> {
    try {
      if (request.method !== "GET" && request.method !== "HEAD") request.body = await requestInput(webRequestOf(request))
      next()
    } catch (error) {
      next(error)
    }
  }
}
