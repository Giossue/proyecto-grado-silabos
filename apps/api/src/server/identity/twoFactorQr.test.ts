// @vitest-environment node
import { describe, expect, it } from "vitest"
import golden from "./__fixtures__/qr-golden.json"
import { twoFactorQrCodeSvg, twoFactorQrCodeUrl } from "./twoFactorQr"

describe("two-factor QR code, against Fortify's twoFactorQrCodeSvg", () => {
  for (const [index, entry] of golden.entries()) {
    it(`writes the same otpauth URL and SVG bytes as bacon/bacon-qr-code: case ${index + 1}`, () => {
      expect(twoFactorQrCodeUrl(entry.company, entry.email, entry.secret)).toBe(entry.url)
      expect(twoFactorQrCodeSvg(entry.company, entry.email, entry.secret)).toBe(entry.svg)
    })
  }
})
