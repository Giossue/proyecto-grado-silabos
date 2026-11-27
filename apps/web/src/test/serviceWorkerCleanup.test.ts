// @vitest-environment node
import { readFileSync } from "node:fs"
import path from "node:path"
import { runInNewContext } from "node:vm"
import { describe, expect, it, vi } from "vitest"

type Listener = (event: { waitUntil(work: Promise<unknown>): void }) => void

function startWorker(options: { cachesFail?: boolean } = {}) {
  const source = readFileSync(path.resolve(__dirname, "../../public/sw.js"), "utf8")
  const listeners = new Map<string, Listener>()
  const steps: string[] = []
  const stored = new Set(["old-precache", "old-runtime"])
  const tabs = [
    { url: "https://app.test/panel", navigate: vi.fn(async () => { throw new Error("tab is closing") }) },
    { url: "https://app.test/admin/periodos", navigate: vi.fn(async () => { steps.push("reload") }) },
  ]
  const self = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: vi.fn(async () => {}),
    registration: { unregister: vi.fn(async () => { steps.push("unregister"); return true }) },
    clients: { matchAll: vi.fn(async () => tabs) },
  }
  const caches = {
    keys: async () => {
      if (options.cachesFail) throw new Error("storage unavailable")
      return [...stored]
    },
    delete: async (key: string) => stored.delete(key),
  }
  runInNewContext(source, { self, caches })
  const dispatch = async (type: string) => {
    const pending: Promise<unknown>[] = []
    listeners.get(type)?.({ waitUntil: (work) => pending.push(work) })
    await Promise.all(pending)
  }
  return { listeners, steps, stored, tabs, self, dispatch }
}

describe("cleanup service worker (public/sw.js)", () => {
  it("replaces the old worker without waiting for its tabs to close", async () => {
    const worker = startWorker()
    await worker.dispatch("install")
    expect(worker.self.skipWaiting).toHaveBeenCalled()
  })

  it("deletes the old caches, unregisters itself and then reloads every open tab", async () => {
    const worker = startWorker()
    await worker.dispatch("activate")
    expect([...worker.stored]).toEqual([])
    expect(worker.self.clients.matchAll).toHaveBeenCalledWith({ type: "window" })
    for (const tab of worker.tabs) expect(tab.navigate).toHaveBeenCalledWith(tab.url)
    expect(worker.steps).toEqual(["unregister", "reload"])
  })

  it("still unregisters when the caches cannot be read", async () => {
    const worker = startWorker({ cachesFail: true })
    await worker.dispatch("activate")
    expect(worker.self.registration.unregister).toHaveBeenCalled()
  })

  it("never intercepts requests", () => {
    expect(startWorker().listeners.has("fetch")).toBe(false)
  })
})
