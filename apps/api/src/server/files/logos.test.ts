// @vitest-environment node
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import golden from "./__fixtures__/logos-golden.json"
import { FACULTY_LOGO, INSTITUTION_LOGO, logoErrors } from "./logos"
import { decodePng, fitPng } from "./png"

type Entry = { faculty_errors?: string[]; institution_errors: string[]; faculty_pixels?: string; institution_pixels?: string }
const entries = Object.entries(golden as Record<string, Entry>)
const files = entries.filter(([name]) => !name.startsWith("valor:"))
const upload = (name: string) => ({ originalName: name, clientMimeType: "image/png", bytes: readFileSync(path.join(__dirname, "__fixtures__", "logos", name)) })

function pixels(png: Buffer): string {
  const image = decodePng(png)
  const bytes = Buffer.alloc(image.width * image.height * 4)
  for (let index = 0; index < image.width * image.height; index++) bytes.set([image.red[index], image.green[index], image.blue[index], image.alpha[index]], index * 4)
  return createHash("sha256").update(bytes).digest("hex")
}

describe("logoErrors (InstitutionalLogos::rules)", () => {
  it.each(files)("%s gets the same faculty and institution errors as Laravel", (name, expected) => {
    expect(logoErrors(upload(name), "logotipo", false)).toEqual(expected.faculty_errors)
    expect(logoErrors(upload(name), "imagen del logo", true)).toEqual(expected.institution_errors)
  })

  it("answers Laravel's messages for a text value and for a missing logo", () => {
    expect(logoErrors("abc", "imagen del logo", true)).toEqual((golden as Record<string, Entry>)["valor:texto"].institution_errors)
    expect(logoErrors(null, "imagen del logo", true)).toEqual((golden as Record<string, Entry>)["valor:vacio"].institution_errors)
    expect(logoErrors(null, "logotipo", false)).toEqual([])
  })
})

describe("fitPng (InstitutionalLogos::fit with GD)", () => {
  const fitted = files.filter(([, expected]) => expected.faculty_errors?.length === 0)
  it.each(fitted)("%s fits the faculty and institution canvases pixel by pixel like GD", (name, expected) => {
    expect(pixels(fitPng(upload(name).bytes, FACULTY_LOGO))).toBe(expected.faculty_pixels)
    expect(pixels(fitPng(upload(name).bytes, INSTITUTION_LOGO))).toBe(expected.institution_pixels)
  })
})
