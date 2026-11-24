export function columnLetter(index: number): string {
  let text = ""
  let value = index
  while (value > 0) {
    const remainder = (value - 1) % 26
    text = String.fromCharCode(65 + remainder) + text
    value = Math.floor((value - 1) / 26)
  }
  return text
}

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

export function xlsxDownload(bytes: Buffer, filename: string, cacheControl = "no-cache, private"): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": XLSX_TYPE,
      "Content-Disposition": `attachment; filename=${filename}`,
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
      "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  })
}
