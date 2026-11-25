import { ExpressAdapter } from "@nestjs/platform-express"
import type { Response as ExpressResponse } from "express"
import { WebReply } from "./web-reply"
import { sendWebResponse } from "./web-response"

export class WebResponseExpressAdapter extends ExpressAdapter {
  reply(response: ExpressResponse, body: unknown, statusCode?: number) {
    if (body instanceof WebReply) return sendWebResponse(response, body.response)
    return super.reply(response, body, statusCode)
  }
}
