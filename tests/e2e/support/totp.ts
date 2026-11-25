import { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from "@zxing/library"
import { expect, type Locator, type Page } from "@playwright/test"
import { Secret, TOTP, URI } from "otpauth"

export async function secretFromQr(image: Locator): Promise<string> {
  await expect(image).toBeVisible()
  const pixels = await image.evaluate(async (element) => {
    const source = element instanceof HTMLImageElement ? element : element.querySelector("img, svg")
    const size = 400
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext("2d")!
    context.fillStyle = "#fff"
    context.fillRect(0, 0, size, size)
    const picture = new Image()
    if (source instanceof HTMLImageElement) picture.src = source.src
    else if (source) picture.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(source))}`
    await picture.decode()
    context.drawImage(picture, 20, 20, size - 40, size - 40)
    return Array.from(context.getImageData(0, 0, size, size).data)
  })
  const luminance = new Uint8ClampedArray(pixels.length / 4)
  for (let index = 0; index < luminance.length; index += 1) {
    luminance[index] = Math.round((pixels[index * 4]! + pixels[index * 4 + 1]! + pixels[index * 4 + 2]!) / 3)
  }
  const text = new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance, 400, 400)))).getText()
  const parsed = URI.parse(text)
  if (!(parsed instanceof TOTP)) throw new Error("The QR code is not a TOTP URI")
  return parsed.secret.base32
}

const totpOf = (secret: string) => new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 })

export async function freshCode(secret: string, used: Set<string>): Promise<string> {
  const totp = totpOf(secret)
  for (;;) {
    const remaining = 30 - (Math.floor(Date.now() / 1000) % 30)
    const code = totp.generate()
    if (!used.has(code) && remaining > 5) {
      used.add(code)
      return code
    }
    await new Promise((resolve) => setTimeout(resolve, (remaining + 1) * 1000))
  }
}

export async function typeCode(page: Page, input: Locator, code: string): Promise<void> {
  await input.click()
  await page.keyboard.type(code, { delay: 40 })
}
