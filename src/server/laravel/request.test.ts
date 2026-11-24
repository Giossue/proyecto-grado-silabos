// @vitest-environment node
import { describe, expect, it } from "vitest"
import { laravelFullUrl } from "./request"

const golden: Record<string, string> = {
  "/logos/institucion": "http://localhost:3000/logos/institucion",
  "/logos/institucion?v=1789000000": "http://localhost:3000/logos/institucion?v=1789000000",
  "/logos/institucion?v=17&a=b+c": "http://localhost:3000/logos/institucion?a=b%20c&v=17",
  "/x?b=2&a=1&b=3": "http://localhost:3000/x?a=1&b=3",
  "/x?a=%41%2f%7e&z=": "http://localhost:3000/x?a=A%2F~&z=",
  "/x?k": "http://localhost:3000/x?k=",
  "/x?k=a=b": "http://localhost:3000/x?k=a%3Db",
  "/x?q=%C3%B1+%E2%82%AC": "http://localhost:3000/x?q=%C3%B1%20%E2%82%AC",
  "/?a=1": "http://localhost:3000/?a=1",
  "/x/?z=1": "http://localhost:3000/x?z=1",
  "/x?a=1&": "http://localhost:3000/x?a=1",
  "/x?a=%zz": "http://localhost:3000/x?a=%25zz",
  "/x?a=!'()*": "http://localhost:3000/x?a=%21%27%28%29%2A",
}

describe("laravelFullUrl", () => {
  it.each(Object.entries(golden))("writes %s like Request::fullUrl()", (path, expected) => {
    expect(laravelFullUrl(new Request(`http://localhost:3000${path}`))).toBe(expected)
  })

  it.each(["/x?a[]=1", "/x?a.b=1", "/x?1=2", "/x?%61=1", "/x?=1"])("gives up on %s, whose keys PHP rewrites", (path) => {
    expect(laravelFullUrl(new Request(`http://localhost:3000${path}`))).toBeNull()
  })
})
