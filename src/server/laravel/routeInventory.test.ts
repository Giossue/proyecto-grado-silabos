// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { describe, expect, it } from "vitest"
import { LARAVEL_ROUTES, laravelRoutesMatching, REMOVED_ROUTES, type LaravelRoute } from "./router"

type NextRoute = { file: string; segments: string[]; native: Set<string>; source: string }

const APP = join(process.cwd(), "src", "app")
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
const UUID = "0198a2b4-1c2d-7e3f-8a9b-0c1d2e3f4a5b"

const ALLOWLIST: Record<string, string> = {
  "GET /": "Laravel's JSON service banner; Next serves the React app at / and never forwarded this path.",
  "HEAD /": "Same as GET /.",
  "GET health/live": "Health probe of the Laravel process itself; Next never forwarded it.",
  "HEAD health/live": "Same as GET health/live.",
  "GET health/ready": "Readiness probe of the Laravel process (database, cache, queue); Next never forwarded it.",
  "HEAD health/ready": "Same as GET health/ready.",
  "GET storage/{path}": "Signed URLs of Laravel's local disk; nothing in the system creates them and Next never forwarded the path.",
  "HEAD storage/{path}": "Same as GET storage/{path}.",
  "PUT storage/{path}": "Signed upload URLs of Laravel's local disk; nothing in the system creates them and Next never forwarded the path.",
}

const FORWARD_SITES: Record<string, { sites: number; reason: string }> = {
  "academic/careerWrites.ts": { sites: 6, reason: "non-JSON body ×5, unported rule" },
  "academic/curriculumWrites.ts": { sites: 1, reason: "non-JSON body" },
  "academic/deletions.ts": { sites: 2, reason: "unknown id ×2" },
  "academic/governance.ts": { sites: 1, reason: "unported rule" },
  "academic/governanceWrites.ts": { sites: 11, reason: "non-JSON body ×3, unported rule ×4, PHP float/date ×2, re-raise ×2" },
  "academic/scheduledSubjects.ts": { sites: 1, reason: "unported rule" },
  "academic/structure.ts": { sites: 1, reason: "unknown id" },
  "academic/supportDocumentWrites.ts": { sites: 3, reason: "unknown id ×2, non-JSON body" },
  "ai/assistantRoutes.ts": { sites: 5, reason: "unknown id ×3, non-JSON body, legacy snapshot" },
  "auth/requireSession.ts": { sites: 1, reason: "session write" },
  "auth/statefulRequest.ts": { sites: 4, reason: "session write ×3, re-raise" },
  "configuration/subjectProfile.ts": { sites: 2, reason: "unknown id ×2" },
  "configuration/subjectProfilePreview.ts": { sites: 2, reason: "unknown id ×2" },
  "configuration/subjectProfileWrites.ts": { sites: 4, reason: "unknown id ×3, non-JSON body" },
  "configuration/templateBuilder.ts": { sites: 4, reason: "legacy snapshot ×3, non-JSON body" },
  "configuration/templateDrafts.ts": { sites: 2, reason: "non-JSON body, legacy snapshot" },
  "configuration/templateLogo.ts": { sites: 1, reason: "non-JSON body" },
  "configuration/templateProvisioner.ts": { sites: 3, reason: "non-JSON body ×2, unknown id" },
  "configuration/templateReads.ts": { sites: 2, reason: "legacy snapshot ×2" },
  "configuration/templateStructure.ts": { sites: 12, reason: "unknown id ×10, legacy snapshot, non-JSON body" },
  "dashboard/dashboard.ts": { sites: 2, reason: "legacy snapshot, unported rule" },
  "documents/docx/syllabusWordDocument.ts": { sites: 2, reason: "PHP float/date, legacy snapshot" },
  "documents/plainTextPdf.ts": { sites: 4, reason: "PHP float/date ×2, legacy snapshot ×2" },
  "documents/revisionDocuments.ts": { sites: 5, reason: "unknown id ×3, non-JSON body, unported rule" },
  "documents/syllabusSnapshot.ts": { sites: 2, reason: "PHP float/date, legacy snapshot" },
  "excel/importRequest.ts": { sites: 1, reason: "non-JSON body" },
  "identity/accountWrites.ts": { sites: 6, reason: "non-JSON body ×2, undecidable email ×2, re-raise, unported rule" },
  "identity/accounts.ts": { sites: 7, reason: "unknown id ×6, unported rule" },
  "identity/careerTeachers.ts": { sites: 2, reason: "non-JSON body, undecidable email" },
  "identity/imports.ts": { sites: 2, reason: "unported rule ×2" },
  "identity/passwordRecovery.ts": { sites: 1, reason: "re-raise" },
  "identity/selfService.ts": { sites: 8, reason: "non-JSON body ×4, unported rule ×2, undecidable email, session write" },
  "identity/session.ts": { sites: 2, reason: "unported rule ×2" },
  "identity/sessions.ts": { sites: 1, reason: "session write" },
  "identity/twoFactor.ts": { sites: 5, reason: "unported rule ×4, non-JSON body" },
  "library/reviewDecisions.ts": { sites: 2, reason: "non-JSON body ×2" },
  "operations/emailPreferences.ts": { sites: 1, reason: "non-JSON body" },
  "operations/notifications.ts": { sites: 1, reason: "session write" },
  "syllabus/convocationWriteStore.ts": { sites: 2, reason: "legacy snapshot ×2" },
  "syllabus/convocationWrites.ts": { sites: 1, reason: "non-JSON body" },
  "syllabus/convocations.ts": { sites: 1, reason: "unknown id" },
  "syllabus/draftField.ts": { sites: 3, reason: "non-JSON body, legacy snapshot, unknown id" },
  "syllabus/draftStart.ts": { sites: 6, reason: "re-raise ×2, unknown id, unported rule, non-JSON body, legacy snapshot" },
  "syllabus/draftValidation.ts": { sites: 1, reason: "unknown id" },
  "syllabus/inProgressWork.ts": { sites: 9, reason: "unknown id ×8, legacy snapshot" },
  "syllabus/processClosing.ts": { sites: 2, reason: "non-JSON body, re-raise" },
  "syllabus/processClosingStore.ts": { sites: 1, reason: "PHP float/date" },
  "syllabus/processWrites.ts": { sites: 4, reason: "non-JSON body ×3, re-raise" },
  "syllabus/processes.ts": { sites: 12, reason: "re-raise ×3, PHP float/date ×3, legacy snapshot ×2, non-JSON body ×2, unknown id ×2" },
  "syllabus/reviewApproval.ts": { sites: 2, reason: "non-JSON body, unported rule" },
  "syllabus/reviewDecisions.ts": { sites: 3, reason: "non-JSON body ×2, re-raise" },
  "syllabus/reviewDetails.ts": { sites: 1, reason: "re-raise" },
  "syllabus/snapshotDocuments.ts": { sites: 2, reason: "PHP float/date, legacy snapshot" },
  "syllabus/submission.ts": { sites: 3, reason: "non-JSON body ×2, re-raise" },
  "syllabus/submissionStore.ts": { sites: 1, reason: "PHP float/date" },
  "syllabus/syllabusDetail.ts": { sites: 3, reason: "legacy snapshot ×2, re-raise" },
}

const SERVER = join(process.cwd(), "src", "server")
const FORWARD = /\.forward\(|new Forward\(|throw new NeedsLaravel/g

function serverFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return serverFiles(path)
    return entry.name.endsWith(".ts") && !entry.name.includes(".test.") ? [path] : []
  })
}

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return routeFiles(path)
    return entry.name === "route.ts" ? [path] : []
  })
}

function nativeMethods(source: string): Set<string> {
  const native = new Set<string>()
  for (const match of source.matchAll(/export (?:async )?function (GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)\b/g)) native.add(match[1])
  for (const block of source.matchAll(/export \{([^}]*)\}/g)) {
    for (const alias of block[1].matchAll(/(\w+) as (GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)\b/g)) {
      if (alias[1] !== "proxyToLaravel" && alias[1] !== "laravelRouterHandler" && alias[1] !== "laravelFallback") native.add(alias[2])
    }
  }
  return native
}

const NEXT_ROUTES: NextRoute[] = routeFiles(APP).map((file) => {
  const source = readFileSync(file, "utf8")
  const segments = relative(APP, file).split(sep).slice(0, -1).filter((segment) => !/^\(.*\)$/.test(segment))
  return { file: relative(process.cwd(), file), segments, native: nativeMethods(source), source }
})

const rank = (segment: string) => (segment.startsWith("[[...") ? 3 : segment.startsWith("[...") ? 2 : segment.startsWith("[") ? 1 : 0)

function nextRouteFor(path: string[]): NextRoute | null {
  const candidates = NEXT_ROUTES.filter(({ segments }) => {
    const last = segments[segments.length - 1] ?? ""
    if (rank(last) >= 2) {
      const fixed = segments.slice(0, -1)
      return path.length > fixed.length && fixed.every((segment, index) => rank(segment) === 1 || segment === path[index])
    }
    return segments.length === path.length && segments.every((segment, index) => rank(segment) === 1 || segment === path[index])
  })
  candidates.sort((left, right) => {
    for (let index = 0; index < Math.max(left.segments.length, right.segments.length); index += 1) {
      const difference = rank(left.segments[index] ?? "") - rank(right.segments[index] ?? "")
      if (difference !== 0) return difference
    }
    return 0
  })
  return candidates[0] ?? null
}

function sampleFor(name: string, where: string | undefined): string {
  if (where === undefined) return `sample-${name}`
  if (where.includes("[\\da-fA-F]{8}")) return UUID
  if (where === ".*") return "sample"
  return where.split("|")[0]
}

function samplePaths(route: LaravelRoute): string[][] {
  const build = (uri: string) =>
    uri === "/" ? [] : uri.split("/").map((segment) => segment.replace(/^\{(\w+)\??\}$/, (_, name: string) => sampleFor(name, route.wheres[name])))
  if (!route.uri.includes("?}")) return [build(route.uri)]
  return [build(route.uri.replace(/\/\{\w+\?\}/g, "")), build(route.uri)]
}

describe("route inventory", () => {
  const rows = LARAVEL_ROUTES.flatMap((route) => route.methods.map((method) => ({ method, route })))

  it.each(rows.map(({ method, route }) => [`${method} ${route.uri}`, method, route] as const))("%s has a Next handler or a justified allowlist entry", (key, method, route) => {
    if (key in ALLOWLIST) {
      expect(ALLOWLIST[key].length).toBeGreaterThan(10)
      return
    }
    for (const path of samplePaths(route)) {
      const next = nextRouteFor(path)
      expect(next, `${key} → /${path.join("/")}`).not.toBeNull()
      const catchAll = next !== null && rank(next.segments[next.segments.length - 1] ?? "") >= 2
      expect(catchAll, `${key} only reaches the catch-all ${next?.file}`).toBe(false)
      const served = next !== null && (next.native.has(method) || (method === "HEAD" && next.native.has("GET")))
      expect(served, `${key} is not served natively by ${next?.file}`).toBe(true)
    }
  })

  it("lists every remaining forward to Laravel with its reason", () => {
    const found = Object.fromEntries(
      serverFiles(SERVER)
        .filter((file) => !file.endsWith(join("laravel", "proxy.ts")))
        .map((file) => [relative(SERVER, file).split(sep).join("/"), readFileSync(file, "utf8").match(FORWARD)?.length ?? 0] as const)
        .filter(([, count]) => count > 0),
    )
    expect(found).toEqual(Object.fromEntries(Object.entries(FORWARD_SITES).map(([file, entry]) => [file, entry.sites])))
    expect(Object.values(FORWARD_SITES).filter((entry) => entry.reason.length < 8)).toEqual([])
  })

  it("never answers with the router a method that Laravel dispatches to a route on the same path", () => {
    const shadowed = NEXT_ROUTES.flatMap((route) => {
      const path = "/" + route.segments.map((segment) => (rank(segment) === 1 ? UUID : rank(segment) >= 2 ? "sample" : segment)).join("/")
      return METHODS.filter((method) => new RegExp(`laravelRouterHandler as ${method}\\b`).test(route.source))
        .filter((method) => laravelRoutesMatching(path).some((laravel) => laravel.methods.includes(method)))
        .map((method) => `${method} ${path}`)
    })
    expect(shadowed).toEqual([])
  })

  it("serves none of the routes removed from the system and leaves them to the unknown-route answer", () => {
    expect(REMOVED_ROUTES.filter((uri) => LARAVEL_ROUTES.some((route) => route.uri === uri))).toEqual([])
    expect(REMOVED_ROUTES.map((uri) => nextRouteFor(uri.split("/"))?.file)).toEqual(REMOVED_ROUTES.map(() => join("src", "app", "api", "[...path]", "route.ts")))
  })

  it("keeps every allowlist entry tied to a real Laravel route", () => {
    const keys = new Set(rows.map(({ method, route }) => `${method} ${route.uri}`))
    expect(Object.keys(ALLOWLIST).filter((key) => !keys.has(key))).toEqual([])
  })

  it("answers every method in every route file without forwarding to Laravel", () => {
    const leaks = NEXT_ROUTES.filter((route) => route.segments[route.segments.length - 1]?.startsWith("[...") !== true)
      .filter((route) => /proxyToLaravel/.test(route.source))
      .map((route) => route.file)
    expect(leaks).toEqual([])
    const silent = NEXT_ROUTES.flatMap((route) =>
      METHODS.filter((method) => {
        if (route.native.has(method) || (method === "HEAD" && route.native.has("GET"))) return false
        return !new RegExp(`(laravelRouterHandler|laravelFallback) as ${method}\\b`).test(route.source)
      }).map((method) => `${method} ${route.file}`),
    )
    expect(silent).toEqual([])
  })
})
