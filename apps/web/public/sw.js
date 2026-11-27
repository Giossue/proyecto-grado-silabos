// Cleanup worker. A previous app on this domain registered /sw.js, and browsers that still
// have it keep getting that app's cached page (blank screen on a normal reload). They fetch
// this file as its update: it drops those caches, unregisters itself and reloads the tabs.
// The current app registers no service worker. Keep this file while old browsers may remain.
self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(cleanUp())
})

async function cleanUp() {
  const keys = await caches.keys().catch(() => [])
  await Promise.allSettled(keys.map((key) => caches.delete(key)))
  await self.registration.unregister()
  const tabs = await self.clients.matchAll({ type: "window" })
  // Not awaited: a reload may itself wait for this activation to finish.
  tabs.forEach((tab) => tab.navigate(tab.url).catch(() => {}))
}
