import { createParamDecorator, type ExecutionContext } from "@nestjs/common"
import type { PhpArray } from "../../server/http/input"
import { phpQuery } from "../../server/http/input"
import { queryParams, requestUrl } from "../../server/http/request"
import { type ApiRequest, webRequestOf } from "../http/web-request"

export function queryInput(url: URL): PhpArray {
  const input: PhpArray = {}
  for (const [name, value] of queryParams(url)) if (!name.includes("[")) input[name] = value
  const tree = phpQuery(url)
  for (const name of url.searchParams.keys()) {
    const open = name.indexOf("[")
    if (open <= 0) continue
    const base = name.slice(0, open)
    const parsed = tree[base]
    input[base] = typeof parsed === "object" && parsed !== null ? parsed : {}
  }
  return input
}

export const QueryInput = createParamDecorator((_data: unknown, context: ExecutionContext) => queryInput(new URL(webRequestOf(context.switchToHttp().getRequest<ApiRequest>()).url)))

export type PageLinks = { path: string; query: ReturnType<typeof queryParams> }

export const PageContext = createParamDecorator((_data: unknown, context: ExecutionContext): PageLinks => {
  const request = webRequestOf(context.switchToHttp().getRequest<ApiRequest>())
  return { path: requestUrl(request), query: queryParams(new URL(request.url)) }
})
