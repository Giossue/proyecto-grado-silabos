import "../src/config/load-env"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../src/generated/prisma/client"
import { seedDatabase, seedOptions } from "../src/server/setup/seeding"

async function main(prisma: PrismaClient): Promise<void> {
  const result = await seedDatabase(prisma, seedOptions(process.env))
  console.log(result.adminCreated ? "Administrator created" : "Administrator already exists")
  console.log(result.adminRoleCreated ? "Administrator role assigned" : "Administrator role already assigned")
  console.log(result.templateId ? "Official template created" : "A template already exists")
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

main(prisma).then(
  () => prisma.$disconnect(),
  async (error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    await prisma.$disconnect()
    process.exit(1)
  },
)
