import os from "node:os"
import path from "node:path"
import { defineConfig, devices } from "@playwright/test"

const port = Number(process.env.E2E_PORT ?? 3200)
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`
const scratch = process.env.E2E_SCRATCH_DIR ?? path.join(os.tmpdir(), "silabos-e2e")
const serverEnv = {
  LARAVEL_FALLBACK: "off",
  SANCTUM_STATEFUL_DOMAINS: new URL(baseURL).host,
}

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: path.join(scratch, "results"),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    locale: "es-EC",
    timezoneId: "America/Guayaquil",
    viewport: { width: 1440, height: 900 },
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"], channel: "chromium", viewport: { width: 1440, height: 900 } },
    },
    {
      name: "chromium",
      testIgnore: /auth\.setup\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        channel: "chromium",
        viewport: { width: 1440, height: 900 },
        launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] },
      },
    },
  ],
  webServer: [
    {
      command: `node node_modules/next/dist/bin/next start -p ${port} 2>&1 | tee -a ${JSON.stringify(path.join(scratch, "server.log"))}`,
      url: `${baseURL}/ingresar`,
      reuseExistingServer: true,
      timeout: 120_000,
      env: serverEnv,
    },
    ...(process.env.E2E_EXTERNAL_WORKER
      ? []
      : [
          {
            command: `npm run worker 2>&1 | tee -a ${JSON.stringify(path.join(scratch, "worker.log"))}`,
            wait: { stdout: /worker-started/ },
            timeout: 120_000,
            env: { ...serverEnv, QUEUE_MAX_TIME: "0" },
          },
        ]),
  ],
})
