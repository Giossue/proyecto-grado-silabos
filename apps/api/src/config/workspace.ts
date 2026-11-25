import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

export function workspaceRoot(start: string = process.cwd()): string {
  let current = resolve(start)
  while (!existsSync(join(current, "pnpm-workspace.yaml"))) {
    const parent = dirname(current)
    if (parent === current) return resolve(start)
    current = parent
  }
  return current
}

export function envFiles(root: string = workspaceRoot()): string[] {
  return [join(root, ".env.local"), join(root, ".env")]
}
