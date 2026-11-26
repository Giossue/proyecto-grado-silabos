import type { Db } from "../../prisma/db"

export type StoredLogo = { disk: string; path: string | null; classification: string | null }
export type StoredFaculty = { id: string; logo: StoredLogo | null }

export interface LogoStore {
  faculty(id: string): Promise<StoredFaculty | null>
}

export const LOGO_DISK = "private"

type FacultyLogoRow = { id: string; has_logo: boolean; disk: string | null; path: string | null; classification: string | null }

export function createLogoStore(db: Db): LogoStore {
  return {
    async faculty(id) {
      const [row] = await db.$queryRaw<FacultyLogoRow[]>`select facultades.facultad_id::text as id, archivos.archivo_id is not null as has_logo, archivos.disco as disk,
            archivos.ruta_archivo as path, archivos.categoria as classification
          from facultades left join archivos on archivos.archivo_id = facultades.logo_archivo_id
          where facultades.facultad_id = ${id}::uuid limit 1`
      if (!row) return null
      return { id: row.id, logo: row.has_logo ? { disk: row.disk ?? LOGO_DISK, path: row.path, classification: row.classification } : null }
    },
  }
}
