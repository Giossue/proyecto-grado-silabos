import { fireEvent, waitFor } from "@testing-library/react"
import { flush } from "@/test/render"

export const fillSignatureDialog = async (p12: Uint8Array, password: string): Promise<void> => {
  const file = document.querySelector<HTMLInputElement>("#signature-certificate")!
  Object.defineProperty(file, "files", { value: [new File([p12 as BlobPart], "firma.p12")], configurable: true })
  fireEvent.change(file)
  const secret = document.querySelector<HTMLInputElement>("#signature-password")!
  fireEvent.change(secret, { target: { value: password } })
  await flush()
}

const submitButton = (): HTMLButtonElement | null =>
  document.querySelector<HTMLButtonElement>('[data-testid="signature-form"] button[type="submit"]')

export const confirmSignatureDialog = async (): Promise<void> => {
  fireEvent.submit(document.querySelector<HTMLFormElement>('[data-testid="signature-form"]')!)
  await flush()
  await waitFor(
    () => {
      if (submitButton()?.disabled) throw new Error("La firma sigue en curso")
    },
    { timeout: 10_000, interval: 10 },
  )
  await flush()
}
