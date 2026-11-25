import path from "node:path"
import { BASELINE_TAG, markBaselineApplied } from "./baseline"

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.error("DATABASE_URL is not set")
  process.exit(1)
}

markBaselineApplied(connectionString, path.resolve("src/db/drizzle")).then(
  (inserted) => {
    console.log(inserted ? `${BASELINE_TAG} marked as applied` : `${BASELINE_TAG} was already marked as applied`)
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  },
)
