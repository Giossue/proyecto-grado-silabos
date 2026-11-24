import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { isUuid } from "../academic/structure"
import { laravelRoot } from "../laravel/request"
import { diskExists, diskPath, fileBase64, fileModifiedAt, publicPath } from "../laravel/storage"
import { rowsOf, type Executor } from "../syllabus/teacherSyllabusQueries"

export type StoredLogo = { disk: string; path: string | null; classification: string | null }
export type StoredFaculty = { id: string; logo: StoredLogo | null }

export interface LogoStore {
  faculty(id: string): Promise<StoredFaculty | null>
}

const DISK = "private"
const INSTITUTION_PATH = "logos/institucion.png"
const DEFAULT_INSTITUTION = "images/silabo/logo-universidad.png"
const DEFAULT_FACULTY = "images/silabo/facultad.jpeg"

export async function institutionPath(): Promise<string> {
  return (await diskExists(DISK, INSTITUTION_PATH)) ? diskPath(DISK, INSTITUTION_PATH) : publicPath(DEFAULT_INSTITUTION)
}

async function storedPath(logo: StoredLogo | null): Promise<string | null> {
  const disk = logo === null ? DISK : logo.disk
  const relative = logo?.path
  return typeof relative === "string" && relative !== "" && (await diskExists(disk, relative)) ? diskPath(disk, relative) : null
}

export async function facultyPath(faculty: StoredFaculty | null): Promise<string> {
  return (await storedPath(faculty?.logo ?? null)) ?? publicPath(DEFAULT_FACULTY)
}

async function findFaculty(id: unknown, store: LogoStore): Promise<StoredFaculty | null> {
  return typeof id === "string" && isUuid(id) ? store.faculty(id) : null
}

export async function facultyIsConfigured(faculty: StoredFaculty | null): Promise<boolean> {
  const logo = faculty?.logo ?? null
  return logo !== null && logo.classification === "logo_facultad" && (await storedPath(logo)) !== null
}

export async function institutionUrl(request: Request): Promise<string> {
  return `${laravelRoot(request)}/logos/institucion?v=${await fileModifiedAt(await institutionPath())}`
}

export async function facultyUrl(request: Request, facultyId: unknown, store: LogoStore): Promise<string> {
  const faculty = await findFaculty(facultyId, store)
  if (faculty !== null && (await facultyIsConfigured(faculty))) {
    return `${laravelRoot(request)}/logos/facultad/${faculty.id}?v=${await fileModifiedAt(await facultyPath(faculty))}`
  }
  return `${laravelRoot(request)}/${DEFAULT_FACULTY}?v=${await fileModifiedAt(publicPath(DEFAULT_FACULTY))}`
}

export async function presentationLogos(request: Request, facultyId: unknown, store: LogoStore): Promise<{ institution: string; faculty: string }> {
  return { institution: await institutionUrl(request), faculty: await facultyUrl(request, facultyId, store) }
}

export async function embeddedLogos(facultyId: string | null, store: LogoStore): Promise<{ institution: string; faculty: string }> {
  return {
    institution: await fileBase64(await institutionPath()),
    faculty: await fileBase64(await facultyPath(await findFaculty(facultyId, store))),
  }
}

export function createLogoStore(executor: Executor = db as unknown as Executor): LogoStore {
  return {
    async faculty(id) {
      const [row] = await rowsOf<{ id: string; has_logo: boolean; disk: string | null; path: string | null; classification: string | null }>(
        executor,
        sql`select facultades.facultad_id::text as id, archivos.archivo_id is not null as has_logo, archivos.disco as disk,
            archivos.ruta_archivo as path, archivos.categoria as classification
          from facultades left join archivos on archivos.archivo_id = facultades.logo_archivo_id
          where facultades.facultad_id = ${id}::uuid limit 1`,
      )
      if (!row) return null
      return { id: row.id, logo: row.has_logo ? { disk: row.disk ?? DISK, path: row.path, classification: row.classification } : null }
    },
  }
}
