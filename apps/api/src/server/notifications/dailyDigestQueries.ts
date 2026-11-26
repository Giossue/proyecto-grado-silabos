import { Prisma } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"
import { institutionDateSql, jsonText } from "../../prisma/sql"
import { phpJsonDecode } from "../configuration/phpValues"
import { LIBRARY_FROM, OUTCOME_SQL } from "../library/reviewQueries"
import { reviewConditions } from "../syllabus/coordinationReviewQueries"
import { convocationWhere } from "../syllabus/syllabusSql"
import type { DigestPending, DigestPerson } from "./dailyDigest"

// Only an open process within its delivery date asks anything of anyone: nothing while paused, finished or past due.
// An extension moves the delivery date, so the summary comes back with it.
function openOn(today: string): Prisma.Sql {
  const running = Prisma.sql`exists (select 1 from convocatorias_universidad proceso_abierto
    where proceso_abierto.convocatoria_universidad_id = convocatoria_filtro.convocatoria_universidad_id and proceso_abierto.estado_convocatoria_universidad = 'abierto'
      and ${institutionDateSql(Prisma.raw("proceso_abierto.fecha_entrega"))} >= ${today})`
  return convocationWhere(Prisma.sql`convocatoria_filtro.estado_convocatoria_carrera = 'abierto' and ${running}`)
}

const PERSON = Prisma.sql`usuarios.usuario_id::text as id, usuarios.nombre_usuario as name, usuarios.correo_electronico as email,
  ${jsonText(Prisma.raw("usuarios.preferencias_correo_usuario"))} as preferences`

type PersonRow = Omit<DigestPerson, "preferences"> & { preferences: string | null }

const pendingFor = (role: string, rows: PersonRow[]): DigestPending[] => rows.map((row) => ({ role, person: { ...row, preferences: phpJsonDecode(row.preferences) } }))

/** Accounts not activated yet are included: they may already have syllabi waiting. */
export async function digestPendingOn(db: Db, today: string): Promise<DigestPending[]> {
  const open = openOn(today)
  const teachers = await db.$queryRaw<PersonRow[]>`select ${PERSON} from usuarios
    where usuarios.usuario_activo = true and exists (select 1 from docentes_vigentes_silabo
      inner join silabos on silabos.silabo_id = docentes_vigentes_silabo.silabo_id
      where docentes_vigentes_silabo.usuario_id = usuarios.usuario_id and silabos.estado_silabo in ('sin_iniciar', 'borrador', 'correccion_solicitada') and ${open})`

  const coordinations = await db.$queryRaw<(PersonRow & { careerId: string })[]>`select ${PERSON}, asignaciones_rol.carrera_id::text as "careerId" from usuarios
    inner join asignaciones_rol on asignaciones_rol.usuario_id = usuarios.usuario_id
    where usuarios.usuario_activo = true and asignaciones_rol.asignacion_rol_activa = true and asignaciones_rol.rol = 'coordinador'`
  const coordinators: PersonRow[] = []
  for (const { careerId, ...person } of coordinations) {
    const [waiting] = await db.$queryRaw<unknown[]>`select 1 from silabos where ${reviewConditions({ careerId, search: "" })} and ${open} limit 1`
    if (waiting !== undefined) coordinators.push(person)
  }

  // The library queue names the syllabus «silabo»; the open-process rule is written for «silabos».
  const librarians = await db.$queryRaw<PersonRow[]>`select ${PERSON} from usuarios
    where usuarios.usuario_activo = true
      and exists (select 1 from asignaciones_rol where asignaciones_rol.usuario_id = usuarios.usuario_id
        and asignaciones_rol.asignacion_rol_activa = true and asignaciones_rol.rol = 'bibliotecario')
      and exists (select 1 ${LIBRARY_FROM} where (${OUTCOME_SQL}) = 'pendiente'
        and exists (select 1 from silabos where silabos.silabo_id = silabo.silabo_id and ${open}))`

  return [...pendingFor("docente", teachers), ...pendingFor("coordinador", coordinators), ...pendingFor("bibliotecario", librarians)]
}
