import fs from "node:fs"
import path from "node:path"
import { test as setup } from "@playwright/test"
import { accounts, storageStateOf, type AccountKey } from "./support/accounts"
import { loginAs } from "./support/session"

const keys: AccountKey[] = ["admin", "coordinator", "teacher", "teacher2", "teacher3", "librarian"]

for (const key of keys) {
  setup(`authenticate ${key}`, async ({ page }) => {
    const file = storageStateOf(key)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    await loginAs(page, accounts[key])
    await page.context().storageState({ path: file })
  })
}
