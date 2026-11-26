import { isUuid } from "../academic/structure"
import { requestRoot } from "../http/request"
import { fileBase64, fileModifiedAt, publicPath } from "../http/storage"
import { storageWriter } from "../http/storageWriter"
import { localFile, storedFile, type FileSource } from "../storage/fileSource"
import { LOGO_DISK, type LogoStore, type StoredFaculty, type StoredLogo } from "../shared/logoStore"

export type { LogoStore, StoredFaculty, StoredLogo }

const DISK = LOGO_DISK
const INSTITUTION_PATH = "logos/institucion.png"
const DEFAULT_INSTITUTION = "images/silabo/logo-universidad.png"
const DEFAULT_FACULTY = "images/silabo/facultad.jpeg"

async function existing(disk: string, relative: string): Promise<FileSource | null> {
  const storage = storageWriter()
  return (await storage.stat(disk, relative)) !== null ? storedFile(storage, disk, relative) : null
}

export async function institutionFile(): Promise<FileSource> {
  return (await existing(DISK, INSTITUTION_PATH)) ?? localFile(publicPath(DEFAULT_INSTITUTION))
}

export async function institutionPath(): Promise<string> {
  return (await institutionFile()).key
}

async function storedPath(logo: StoredLogo | null): Promise<FileSource | null> {
  const disk = logo === null ? DISK : logo.disk
  const relative = logo?.path
  return typeof relative === "string" && relative !== "" ? existing(disk, relative) : null
}

export async function facultyFile(faculty: StoredFaculty | null): Promise<FileSource> {
  return (await storedPath(faculty?.logo ?? null)) ?? localFile(publicPath(DEFAULT_FACULTY))
}

export async function facultyPath(faculty: StoredFaculty | null): Promise<string> {
  return (await facultyFile(faculty)).key
}

async function findFaculty(id: unknown, store: LogoStore): Promise<StoredFaculty | null> {
  return typeof id === "string" && isUuid(id) ? store.faculty(id) : null
}

export async function facultyIsConfigured(faculty: StoredFaculty | null): Promise<boolean> {
  const logo = faculty?.logo ?? null
  return logo !== null && logo.classification === "logo_facultad" && (await storedPath(logo)) !== null
}

export async function institutionUrl(request: Request): Promise<string> {
  return `${requestRoot(request)}/logos/institucion?v=${await fileModifiedAt(await institutionFile())}`
}

export async function configuredFacultyUrl(request: Request, faculty: StoredFaculty | null): Promise<string | null> {
  if (faculty === null || !(await facultyIsConfigured(faculty))) return null
  return `${requestRoot(request)}/logos/facultad/${faculty.id}?v=${await fileModifiedAt(await facultyFile(faculty))}`
}

export async function defaultFacultyUrl(request: Request): Promise<string> {
  return `${requestRoot(request)}/${DEFAULT_FACULTY}?v=${await fileModifiedAt(publicPath(DEFAULT_FACULTY))}`
}

export async function facultyUrl(request: Request, facultyId: unknown, store: LogoStore): Promise<string> {
  return (await configuredFacultyUrl(request, await findFaculty(facultyId, store))) ?? defaultFacultyUrl(request)
}

export async function presentationLogos(request: Request, facultyId: unknown, store: LogoStore): Promise<{ institution: string; faculty: string }> {
  return { institution: await institutionUrl(request), faculty: await facultyUrl(request, facultyId, store) }
}

export async function embeddedLogos(facultyId: string | null, store: LogoStore): Promise<{ institution: string; faculty: string }> {
  return {
    institution: await fileBase64(await institutionFile()),
    faculty: await fileBase64(await facultyFile(await findFaculty(facultyId, store))),
  }
}
