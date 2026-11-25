// @vitest-environment node
import { describe, expect, it } from "vitest"
import golden from "@/server/operations/__fixtures__/system-settings-golden.json"
import { strIsUrl } from "./strIsUrl"

describe("strIsUrl", () => {
  it.each(golden.urls.map((sample) => [sample.url, sample] as const))("matches Str::isUrl for %j", (url, sample) => {
    expect(strIsUrl(url, ["https"])).toBe(sample.https)
    expect(strIsUrl(url, ["http", "https"])).toBe(sample["http,https"])
  })

  it("rejects values that are not strings", () => {
    expect(strIsUrl(5, ["https"])).toBe(false)
    expect(strIsUrl(null, ["https"])).toBe(false)
  })
})
