import { db, pool } from "./index"
import { seedDatabase, seedOptions } from "./seeding"

async function main() {
  const result = await seedDatabase(db, seedOptions(process.env))
  console.log(result.adminCreated ? "Administrator created" : "Administrator already exists")
  console.log(result.adminRoleCreated ? "Administrator role assigned" : "Administrator role already assigned")
  console.log(result.templateId ? "Official template created" : "A template already exists")
}

main().then(
  () => pool.end(),
  async (error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    await pool.end()
    process.exit(1)
  },
)
