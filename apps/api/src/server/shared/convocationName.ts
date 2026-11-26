export function convocationName(career: string, period: string | null): string {
  return `${career} · ${period ?? "Período"}`.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "")
}
