import { existsSync } from "node:fs"
import { join } from "node:path"
import { loadEnvFile } from "node:process"
import { envFiles, workspaceRoot } from "./workspace"

export function loadEnvironment(root: string = workspaceRoot()): void {
  for (const file of envFiles(root)) if (existsSync(file)) loadEnvFile(file)
  process.env.PUBLIC_ASSETS_PATH ||= join(root, "assets")
  process.env.STORAGE_PATH ||= join(root, "storage")
}

loadEnvironment()
