import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { FileDropzone } from "@/components/domain/FileDropzone"

const fileInput = (container: HTMLElement): HTMLInputElement => container.querySelector<HTMLInputElement>('input[type="file"]')!

const selectFiles = (input: HTMLInputElement, files: File[]): void => {
  Object.defineProperty(input, "files", { configurable: true, value: files })
  fireEvent.change(input)
}

describe("FileDropzone", () => {
  it("renders the PNG variant and accepts PNG files", () => {
    const onValueChange = vi.fn()
    const onValidationError = vi.fn()
    const { container } = render(
      <FileDropzone value={null} inputId="faculty-logo" kind="png" required onValueChange={onValueChange} onValidationError={onValidationError} />,
    )

    expect(container.textContent).toContain("Arrastre su PNG aquí")
    expect(fileInput(container).getAttribute("accept")).toBe("image/png,.png")
    expect(fileInput(container).hasAttribute("required")).toBe(true)
    expect(fileInput(container).getAttribute("aria-required")).toBe("true")

    const file = new File(["png"], "facultad.png", { type: "image/png" })
    selectFiles(fileInput(container), [file])

    expect(onValueChange.mock.calls[0]).toEqual([file])
    expect(onValidationError.mock.calls[0]).toEqual([null])
  })

  it("acepta archivos de firma .p12 y .pfx y rechaza otros", () => {
    const onValueChange = vi.fn()
    const onValidationError = vi.fn()
    const { container } = render(
      <FileDropzone value={null} inputId="signature-certificate" kind="certificate" onValueChange={onValueChange} onValidationError={onValidationError} />,
    )

    expect(container.textContent).toContain("Arrastre su archivo de firma aquí")
    expect(fileInput(container).getAttribute("accept")).toBe(".p12,.pfx,application/x-pkcs12")

    const file = new File(["p12"], "firma.p12")
    selectFiles(fileInput(container), [file])
    expect(onValueChange.mock.calls[0]).toEqual([file])

    selectFiles(fileInput(container), [new File(["pdf"], "firma.pdf", { type: "application/pdf" })])
    expect(onValueChange.mock.calls[1]).toEqual([null])
    expect(onValidationError.mock.calls.at(-1)).toEqual(["Seleccione un archivo de firma (.p12 o .pfx)"])
  })

  it("oculta el recuadro cuando ya hay un archivo y lo muestra otra vez al quitarlo", () => {
    const file = new File(["p12"], "firma.p12")
    const onValueChange = vi.fn()
    const { container, rerender } = render(<FileDropzone value={file} inputId="signature-certificate" kind="certificate" onValueChange={onValueChange} />)

    expect(container.querySelector("[data-file-dropzone]")).toBeNull()
    expect(container.textContent).toContain("firma.p12")

    fireEvent.click(screen.getByRole("button", { name: "Quitar archivo de firma" }))
    expect(onValueChange.mock.calls[0]).toEqual([null])
    rerender(<FileDropzone value={null} inputId="signature-certificate" kind="certificate" onValueChange={onValueChange} />)
    expect(container.querySelector("[data-file-dropzone]")).not.toBeNull()
  })

  it("rejects a non-PNG file in the PNG variant", () => {
    const onValueChange = vi.fn()
    const onValidationError = vi.fn()
    const { container } = render(
      <FileDropzone value={null} inputId="faculty-logo" kind="png" onValueChange={onValueChange} onValidationError={onValidationError} />,
    )

    selectFiles(fileInput(container), [new File(["pdf"], "facultad.pdf", { type: "application/pdf" })])

    expect(onValueChange.mock.calls[0]).toEqual([null])
    expect(onValidationError.mock.calls[0]).toEqual(["Seleccione un archivo PNG"])
  })

  it("acepta varios PDF juntos sin sustituir el modelo de un archivo de otros formularios", () => {
    const onValueChange = vi.fn()
    const onFilesSelected = vi.fn()
    const { container } = render(
      <FileDropzone value={null} inputId="pdf-files" kind="pdf" multiple onValueChange={onValueChange} onFilesSelected={onFilesSelected} />,
    )
    const files = [new File(["pdf"], "proyecto.pdf", { type: "application/pdf" }), new File(["pdf"], "anexo.pdf", { type: "application/pdf" })]

    selectFiles(fileInput(container), files)

    expect(onFilesSelected.mock.calls[0]).toEqual([files])
    expect(onValueChange).not.toHaveBeenCalled()
    expect(fileInput(container).hasAttribute("multiple")).toBe(true)
  })
})
