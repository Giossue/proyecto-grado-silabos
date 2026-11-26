import { isUuid } from "../academic/structure"
import { facultyFile, institutionFile } from "../configuration/institutionalLogos"
import type { LogoStore } from "../shared/logoStore"
import type { FileSource } from "../storage/fileSource"
import type { LogoSource } from "./syllabusRenderer"

async function isFile(file: FileSource): Promise<boolean> {
  try {
    return (await file.stat())?.isFile === true
  } catch {
    return false
  }
}

export function storedLogoSource(store: LogoStore): LogoSource {
  return async (source, facultyId) => {
    const file =
      source === "institution" ? await institutionFile() : await facultyFile(facultyId !== null && isUuid(facultyId) ? await store.faculty(facultyId) : null)
    if (!(await isFile(file))) return null
    return { bytes: await file.read(), key: file.key }
  }
}
