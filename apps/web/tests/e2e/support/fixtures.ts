import { test as base, expect, type BrowserContext, type Page } from "@playwright/test"
import { storageStateOf, type AccountKey } from "./accounts"

export type PageIssues = {
  issues: string[]
  expectClean(allow?: RegExp[]): void
  reset(): void
}

const ignoredConsole = [/Download the React DevTools/]

export function watchPage(page: Page): PageIssues {
  const issues: string[] = []
  page.on("console", (message) => {
    if (message.type() !== "error") return
    const text = message.text()
    if (ignoredConsole.some((pattern) => pattern.test(text))) return
    issues.push(`console: ${text.slice(0, 400)} @ ${page.url()}`)
  })
  page.on("pageerror", (error) => issues.push(`pageerror: ${error.message.slice(0, 400)} @ ${page.url()}`))
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? ""
    if (/ERR_ABORTED|NS_BINDING_ABORTED/.test(failure)) return
    issues.push(`requestfailed: ${request.method()} ${request.url()} ${failure}`)
  })
  page.on("response", (response) => {
    if (response.status() < 400) return
    issues.push(`http ${response.status()}: ${response.request().method()} ${response.url()}`)
  })
  return {
    issues,
    expectClean(allow = []) {
      const unexpected = issues.filter((issue) => !allow.some((pattern) => pattern.test(issue)))
      expect(unexpected, unexpected.join("\n")).toEqual([])
    },
    reset() {
      issues.length = 0
    },
  }
}

type Actors = (key: AccountKey) => Promise<Page>

export const test = base.extend<{ actor: Actors; issues: PageIssues }>({
  actor: async ({ browser }, provide) => {
    const contexts: BrowserContext[] = []
    await provide(async (key) => {
      const context = await browser.newContext({ storageState: storageStateOf(key) })
      contexts.push(context)
      return context.newPage()
    })
    await Promise.all(contexts.map((context) => context.close()))
  },
  issues: async ({ page }, provide) => {
    await provide(watchPage(page))
  },
})

export { expect }
