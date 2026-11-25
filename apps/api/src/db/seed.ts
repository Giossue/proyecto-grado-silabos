import { db, pool } from "./index"
import { seedDatabase, seedOptions } from "./seeding"
import { sharedAuth } from "../server/auth/betterAuth"
import type { CredentialExecutor } from "../server/auth/credentials"
import { migrateLegacyAuth } from "../server/auth/legacyAuth"
import { appKey } from "../server/http/config"
import { parseAppKey } from "../server/http/encrypter"

async function main() {
  const result = await seedDatabase(db, seedOptions(process.env))
  console.log(result.adminCreated ? "Administrator created" : "Administrator already exists")
  console.log(result.adminRoleCreated ? "Administrator role assigned" : "Administrator role already assigned")
  console.log(result.templateId ? "Official template created" : "A template already exists")
  const auth = await migrateLegacyAuth(db as unknown as CredentialExecutor, sharedAuth(), parseAppKey(appKey()))
  console.log(`Two-factor secrets imported: ${auth.twoFactor}`)
}

main().then(
  () => pool.end(),
  async (error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    await pool.end()
    process.exit(1)
  },
)
