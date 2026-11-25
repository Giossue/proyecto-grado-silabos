import { readFile, stat } from "node:fs/promises"
import { isUuid } from "../academic/structure"
import { createLogoStore, facultyPath, institutionPath, type LogoStore } from "../configuration/institutionalLogos"
import type { LogoSource } from "./syllabusRenderer"

async function isFile(absolute: string): Promise<boolean> {
  try {
    return (await stat(/*turbopackIgnore: true*/ absolute)).isFile()
  } catch {
    return false
  }
}

export function storedLogoSource(store: LogoStore = createLogoStore()): LogoSource {
  return async (source, facultyId) => {
    const absolute =
      source === "institution" ? await institutionPath() : await facultyPath(facultyId !== null && isUuid(facultyId) ? await store.faculty(facultyId) : null)
    if (!(await isFile(absolute))) return null
    return { bytes: await readFile(/*turbopackIgnore: true*/ absolute), key: absolute }
  }
}
