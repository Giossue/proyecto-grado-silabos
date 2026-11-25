import os from "node:os"
import path from "node:path"

export type AccountKey = "admin" | "coordinator" | "teacher" | "teacher2" | "teacher3" | "librarian"

export type Account = {
  key: AccountKey
  email: string
  home: string
  p12: string
  scope?: { career: string; role: "Coordinación" | "Docencia" }
}

export const accounts: Record<AccountKey, Account> = {
  admin: { key: "admin", email: "admin@email.com", home: "/admin/convocatorias", p12: "admin.p12" },
  coordinator: {
    key: "coordinator",
    email: "coordinador@email.com",
    home: "/coordinacion/revisiones",
    p12: "coordinador.p12",
    scope: { career: "Software · SW-8", role: "Coordinación" },
  },
  teacher: { key: "teacher", email: "docente1@email.com", home: "/docente/mis-silabos", p12: "docente1.p12" },
  teacher2: {
    key: "teacher2",
    email: "docente2@email.com",
    home: "/docente/mis-silabos",
    p12: "docente2.p12",
    scope: { career: "Software · SW-8", role: "Docencia" },
  },
  teacher3: { key: "teacher3", email: "docente3@email.com", home: "/docente/mis-silabos", p12: "docente3.p12" },
  librarian: { key: "librarian", email: "bibliotecario@email.com", home: "/biblioteca/revisiones", p12: "bibliotecario.p12" },
}

export const scratchDir = process.env.E2E_SCRATCH_DIR ?? path.join(os.tmpdir(), "silabos-e2e")

export const storageStateOf = (key: AccountKey): string => path.join(scratchDir, ".auth", `${key}.json`)

export const signaturesDir =
  process.env.E2E_SIGNATURES_DIR ?? path.resolve(__dirname, "../../../../backend/firmas")

export const mailLogPaths = (process.env.E2E_MAIL_LOG ?? [path.join(scratchDir, "server.log"), path.join(scratchDir, "worker.log")].join(","))
  .split(",")
  .filter((entry) => entry !== "")

const required = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} must be set to run the E2E suite.`)
  return value
}

export const password = (): string => required("E2E_PASSWORD")

export const certificatePassword = (): string => required("E2E_P12_PASSWORD")
