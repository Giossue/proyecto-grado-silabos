import { Prisma } from "../../generated/prisma/client"
import { type Db, inTransaction } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import { hasRows } from "../../prisma/sql"
import { uuid7 } from "../http/uuid7"
import { MALLAS_TABLE, insertColumns, updateColumns } from "./columnSql"
import type { MallaData, MallaDeps, MallaTx } from "./mallas"
import type { MallaRecord } from "./structure"

type MallaRow = { id: string; career_id: string; name: string; resolution: string | null; cycle_count: number; state: string; subject_count: number }

function toMalla(row: MallaRow): MallaRecord {
  return {
    id: row.id,
    careerId: row.career_id,
    name: row.name,
    resolution: row.resolution,
    cycleCount: Number(row.cycle_count),
    state: row.state,
    subjectCount: Number(row.subject_count),
  }
}

/** Inserts a malla; shared by malla creation and by career creation (its first, vigente malla). */
export async function insertMalla(db: Db, careerId: string, data: MallaData): Promise<string> {
  const id = uuid7()
  await db.$executeRaw(
    insertColumns(MALLAS_TABLE, {
      malla_id: Prisma.sql`${id}::uuid`,
      carrera_id: Prisma.sql`${careerId}::uuid`,
      nombre_malla: data.name,
      resolucion_malla: data.resolution,
      numero_ciclos: data.cycleCount,
      estado_malla: data.state,
    }),
  )
  return id
}

export function mallaTx(db: Db): MallaTx {
  return {
    async lockCareer(careerId) {
      await db.$queryRaw`select carreras.carrera_id from carreras where carreras.carrera_id = ${careerId}::uuid for update`
    },
    async lockMalla(careerId, mallaId) {
      const [row] = await db.$queryRaw<MallaRow[]>`select mallas.malla_id::text as id, mallas.carrera_id::text as career_id, mallas.nombre_malla as name,
          mallas.resolucion_malla as resolution, mallas.numero_ciclos as cycle_count, mallas.estado_malla as state,
          (select count(*)::int from asignaturas where asignaturas.malla_id = mallas.malla_id) as subject_count
        from mallas where mallas.malla_id = ${mallaId}::uuid and mallas.carrera_id = ${careerId}::uuid limit 1 for update of mallas`
      return row ? toMalla(row) : null
    },
    async demoteVigente(careerId, exceptId) {
      await db.$executeRaw`update mallas set estado_malla = ${"en_transicion"}
        where mallas.carrera_id = ${careerId}::uuid and mallas.estado_malla = ${"vigente"}
          ${exceptId === null ? Prisma.empty : Prisma.sql`and mallas.malla_id <> ${exceptId}::uuid`}`
    },
    insertMalla: (careerId, data) => insertMalla(db, careerId, data),
    async updateMalla(mallaId, columns) {
      await db.$executeRaw(updateColumns(MALLAS_TABLE, columns, Prisma.sql`"mallas"."malla_id" = ${mallaId}::uuid`))
    },
    hasOpenPeriodSyllabi: (mallaId) =>
      hasRows(
        db.$queryRaw<unknown[]>`select silabos.silabo_id from silabos
          inner join paralelos on paralelos.paralelo_id = silabos.paralelo_id
          inner join asignaturas on asignaturas.asignatura_id = paralelos.asignatura_id
          inner join convocatorias_carreras on convocatorias_carreras.convocatoria_carrera_id = silabos.convocatoria_carrera_id
          inner join convocatorias_universidad on convocatorias_universidad.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id
          where asignaturas.malla_id = ${mallaId}::uuid
            and convocatorias_carreras.estado_convocatoria_carrera <> ${"cerrado"}
            and convocatorias_universidad.estado_convocatoria_universidad <> ${"cerrado"}
          limit 1`,
      ),
  }
}

export function createMallaDeps(prisma: PrismaService, mallas: MallaDeps["mallas"]): Omit<MallaDeps, "bridge"> {
  return {
    careerActive: (careerId) =>
      hasRows(prisma.$queryRaw<unknown[]>`select carreras.carrera_id from carreras where carreras.carrera_id = ${careerId}::uuid and carreras.carrera_activa = true limit 1`),
    mallas,
    mallaNameTaken: (careerId, name, except) =>
      hasRows(
        prisma.$queryRaw<unknown[]>`select mallas.malla_id from mallas where mallas.carrera_id = ${careerId}::uuid and mallas.nombre_malla = ${name}
          ${except === null ? Prisma.empty : Prisma.sql`and mallas.malla_id <> ${except}::uuid`} limit 1`,
      ),
    transaction: (work) => inTransaction(prisma, (tx) => work(mallaTx(tx))),
  }
}
