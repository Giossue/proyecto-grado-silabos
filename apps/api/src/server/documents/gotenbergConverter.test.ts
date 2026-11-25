// @vitest-environment node
import { describe, expect, it } from "vitest"
import golden from "./__fixtures__/laravel-gotenberg-golden.json"
import { convertDocx, gotenbergSettings, stabilizePdf } from "./gotenbergConverter"

describe("GotenbergPdfConverter::stabilize", () => {
  it.each(golden.map((item, index) => [index, item] as const))("case %i matches Laravel byte for byte", (_index, item) => {
    const result = stabilizePdf(Buffer.from(item.pdf, "base64"), Buffer.from(item.docx, "base64"), item.generated_at)
    expect(result.toString("base64")).toBe(item.expected)
  })
})

describe("GotenbergPdfConverter::convert", () => {
  const docx = Buffer.from("PK docx")
  const settings = { url: "http://gotenberg.test", timeoutSeconds: 90 }

  it("posts the DOCX to LibreOffice and stabilizes the PDF", async () => {
    const calls: { url: string; name: string | null; size: number }[] = []
    const fetcher = async (url: string, init: RequestInit) => {
      const file = (init.body as FormData).get("files") as File
      calls.push({ url, name: file.name, size: file.size })
      return new Response("%PDF-1.7\n/CreationDate(D:20261124053012Z)\n%%EOF\n", { status: 200 })
    }
    const pdf = await convertDocx(docx, "2026-11-20T12:00:00+00:00", settings, fetcher)
    expect(calls).toEqual([{ url: "http://gotenberg.test/forms/libreoffice/convert", name: "silabo.docx", size: docx.length }])
    expect(pdf.toString("latin1")).toBe("%PDF-1.7\n/CreationDate(D:20261120120000Z00'00')\n%%EOF\n")
  })

  it("fails with the Laravel messages", async () => {
    await expect(convertDocx(docx, "x", settings, async () => new Response("nope", { status: 503 }))).rejects.toThrow("El servicio de conversión a PDF respondió 503.")
    await expect(convertDocx(docx, "x", settings, async () => new Response("<html>", { status: 200 }))).rejects.toThrow("El servicio de conversión a PDF respondió 200.")
    await expect(
      convertDocx(docx, "x", settings, async () => {
        throw new TypeError("fetch failed")
      }),
    ).rejects.toThrow("El servicio de conversión a PDF no respondió.")
  })

  it("reads the Laravel settings", () => {
    expect(gotenbergSettings({ GOTENBERG_URL: "http://127.0.0.1:3010/" })).toEqual({ url: "http://127.0.0.1:3010", timeoutSeconds: 90 })
    expect(gotenbergSettings({ GOTENBERG_TIMEOUT: "15" })).toEqual({ url: "", timeoutSeconds: 15 })
  })
})
