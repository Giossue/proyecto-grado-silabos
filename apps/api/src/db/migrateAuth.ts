import { db, pool } from "./index"
import { sharedAuth } from "../server/auth/betterAuth"
import type { CredentialExecutor } from "../server/auth/credentials"
import { migrateLegacyAuth } from "../server/auth/legacyAuth"
import { appKey } from "../server/http/config"
import { parseAppKey } from "../server/http/encrypter"

async function main() {
  const result = await migrateLegacyAuth(db as unknown as CredentialExecutor, sharedAuth(), parseAppKey(appKey()))
  console.log(`Credential accounts created: ${result.credentials}`)
  console.log(`Two-factor secrets imported: ${result.twoFactor}`)
}

main().then(
  () => pool.end(),
  async (error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    await pool.end()
    process.exit(1)
  },
)
