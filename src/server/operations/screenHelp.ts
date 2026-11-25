import "server-only"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps } from "../auth/types"
import { requestInput } from "../http/input"
import { apiJson, validationError } from "../http/responses"
import { validateInput } from "../http/validation"
import catalog from "./screenHelpCatalog.json"

type HelpText = { title: string; content: string }
type ScreenHelp = { screen: string } & HelpText

export type ScreenHelpDeps = { bridge: BridgeDeps }

const HELP: Record<string, HelpText> = catalog
const SCREEN = /^\/[a-z0-9/:_-]*$/
const ROLE_PREFIXES: Record<string, string> = {
  administrador: "/admin",
  coordinador: "/coordinacion",
  docente: "/docente",
  bibliotecario: "/biblioteca",
}

function defaultDeps(): ScreenHelpDeps {
  return { bridge: defaultBridgeDeps() }
}

export function helpForScreen(screen: string): ScreenHelp | null {
  const help = Object.prototype.hasOwnProperty.call(HELP, screen) ? HELP[screen] : null
  return help === null ? null : { screen, ...help }
}

export function helpUnderPrefix(prefix: string): ScreenHelp[] {
  return Object.entries(HELP)
    .filter(([screen]) => screen === prefix || screen.startsWith(`${prefix}/`))
    .map(([screen, help]) => ({ screen, ...help }))
}

export async function showScreenHelp(request: Request, deps: ScreenHelpDeps = defaultDeps()): Promise<Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  const input = await requestInput(request)
  const errors = await validateInput(input, { screen: ["required", "string", { max: 160 }, { regex: SCREEN }] }, { screen: "pantalla" })
  if (Object.keys(errors).length > 0) return validationError(errors)
  return apiJson({ help: helpForScreen(String(input.screen)) })
}

export async function availableScreenHelp(request: Request, deps: ScreenHelpDeps = defaultDeps()): Promise<Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  const prefix = ROLE_PREFIXES[session.activeRole?.role ?? ""] ?? null
  return apiJson({ help: prefix === null ? [] : helpUnderPrefix(prefix) })
}
