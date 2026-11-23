import { act, render } from "@testing-library/react"
import forge from "node-forge"
import type { ComponentType, ReactNode } from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import type { SignaturePayload } from "@/api/signatures"
import { SignatureDialog, type StatementSigner } from "@/components/domain/syllabus/SignatureDialog"
import { makeTestP12 } from "@/lib/signature/testCertificate"
import { flush } from "@/test/render"
import { confirmSignatureDialog, fillSignatureDialog } from "@/test/signatureDialog"

const fading = vi.hoisted(() => ({ enabled: false, close: null as ((open: boolean) => void) | null }))

vi.mock("@/components/ui/dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/dialog")>()
  const passthrough = <P extends { children?: ReactNode },>(Original: ComponentType<P>) =>
    function Passthrough(props: P) {
      return fading.enabled ? <div>{props.children}</div> : <Original {...props} />
    }
  function Dialog(props: { open?: boolean; onOpenChange?: (open: boolean) => void; children?: ReactNode }) {
    if (!fading.enabled) return <actual.Dialog {...props} />
    fading.close = props.onOpenChange ?? null
    return <div data-modal data-state={props.open ? "open" : "closed"}>{props.children}</div>
  }

  return {
    ...actual,
    Dialog,
    DialogContent: passthrough(actual.DialogContent),
    DialogHeader: passthrough(actual.DialogHeader),
    DialogTitle: passthrough(actual.DialogTitle),
    DialogDescription: passthrough(actual.DialogDescription),
    DialogFooter: passthrough(actual.DialogFooter),
    DialogClose: passthrough(actual.DialogClose),
  }
})

const statement = "silabos-ueb|silabo:s1|accion:aprobacion_coordinacion|huella:abc"

const mountDialog = (run: (sign: StatementSigner) => Promise<void>, onOpenChange = vi.fn()) =>
  render(<SignatureDialog open title="Firmar y enviar a biblioteca" confirmLabel="Firmar y enviar" run={run} onOpenChange={onOpenChange} />)

const dialogText = (): string => document.querySelector('[role="dialog"]')?.textContent ?? ""

describe("SignatureDialog", () => {
  let p12: Uint8Array
  beforeAll(() => {
    p12 = makeTestP12("COORDINACION DE PRUEBA", "clave")
  })
  afterEach(() => {
    fading.enabled = false
    fading.close = null
    document.body.innerHTML = ""
  })

  it("firma la declaración en el navegador y entrega la firma a la acción", async () => {
    let signature: SignaturePayload | null = null
    const run = vi.fn(async (sign: StatementSigner) => {
      signature = sign(statement)
    })
    const onOpenChange = vi.fn()
    const { unmount } = mountDialog(run, onOpenChange)
    await flush()

    await fillSignatureDialog(p12, "clave")
    await confirmSignatureDialog()

    expect(run).toHaveBeenCalledOnce()
    expect(signature!.statement).toBe(statement)
    const der = forge.util.decode64(signature!.cms)
    expect((forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(der, false)) as forge.pkcs7.PkcsSignedData).certificates).toHaveLength(1)
    expect(onOpenChange.mock.calls).toEqual([[false]])
    unmount()
  })

  it("pide archivo y clave antes de firmar", async () => {
    const run = vi.fn()
    const { unmount } = mountDialog(run)
    await flush()

    expect(document.querySelector<HTMLButtonElement>('[data-testid="signature-form"] button[type="submit"]')!.disabled).toBe(true)
    expect(run).not.toHaveBeenCalled()
    unmount()
  })

  it("marca la clave incorrecta sin llamar a la acción", async () => {
    const run = vi.fn()
    const { unmount } = mountDialog(run)
    await flush()

    await fillSignatureDialog(p12, "otra")
    await confirmSignatureDialog()

    expect(dialogText()).toContain("La clave del certificado es incorrecta")
    expect(run).not.toHaveBeenCalled()
    unmount()
  })

  it("muestra el error de firma del servidor y queda abierto", async () => {
    const run = vi.fn(async (sign: StatementSigner) => {
      sign(statement)
      throw new ApiError("Datos inválidos", 422, { signature: ["El titular del certificado no coincide con su cuenta"] })
    })
    const onOpenChange = vi.fn()
    const { unmount } = mountDialog(run, onOpenChange)
    await flush()

    await fillSignatureDialog(p12, "clave")
    await confirmSignatureDialog()

    expect(dialogText()).toContain("El titular del certificado no coincide con su cuenta")
    expect(onOpenChange).not.toHaveBeenCalled()
    unmount()
  })

  it("al cerrar conserva el archivo y la clave mientras se desvanece, y los borra al volver a abrir", async () => {
    fading.enabled = true
    const view = (open: boolean) => <SignatureDialog open={open} title="Firmar y enviar a biblioteca" confirmLabel="Firmar y enviar" run={vi.fn()} onOpenChange={(value) => rerender(view(value))} />
    const { container, rerender, unmount } = render(view(true))
    await flush()
    await fillSignatureDialog(p12, "clave")
    act(() => fading.close?.(false))
    await flush()

    const submit = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('[data-testid="signature-form"] button[type="submit"]')!
    expect(container.querySelector("[data-modal]")!.getAttribute("data-state")).toBe("closed")
    expect(document.querySelector<HTMLInputElement>("#signature-password")!.value).toBe("clave")
    expect(submit().disabled).toBe(false)
    rerender(view(true))
    await flush()
    expect(document.querySelector<HTMLInputElement>("#signature-password")!.value).toBe("")
    expect(submit().disabled).toBe(true)
    unmount()
  })
})
