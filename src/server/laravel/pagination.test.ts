// @vitest-environment node
import { describe, expect, it } from "vitest"
import golden from "./__fixtures__/laravel-golden.json"
import { lengthAwarePaginator, resolveCurrentPage } from "./pagination"
import { phpJsonEncode } from "./phpJson"
import { laravelQuery } from "./request"

describe("LengthAwarePaginator", () => {
  it.each(golden.paginators)("matches PHP for $total items on page $page", ({ total, page, query, json }) => {
    const count = Math.max(0, Math.min(20, total - (page - 1) * 20))
    const items = Array.from({ length: count }, (_, index) => ({ n: index + 1 }))
    const paginator = lengthAwarePaginator({
      items,
      total,
      perPage: 20,
      currentPage: page,
      path: "http://localhost:3000/api/v1/notifications",
      query: new Map(Object.entries(query as Record<string, string>)),
    })
    expect(phpJsonEncode(paginator)).toBe(json)
  })

  it.each(golden.pageInputs)("resolves page input '$input' to $page", ({ input, page }) => {
    expect(resolveCurrentPage(input)).toBe(page)
  })

  it("uses page 1 when there is no page input", () => {
    expect(resolveCurrentPage(null)).toBe(1)
  })
})

describe("Laravel request query", () => {
  it("keeps the first position, the last value, trims and drops empty strings", () => {
    const url = new URL("http://localhost:3000/x?status=+unread+&page=2&status=all&empty=&b=%C3%B1")
    expect([...laravelQuery(url)]).toEqual([
      ["status", "all"],
      ["page", "2"],
      ["empty", null],
      ["b", "ñ"],
    ])
  })
})
