import { managedUserStatus } from "@silabos/shared/lib/managedUserStatus"
import type { ListSort, ManagedUserSort } from "@silabos/shared/schemas/listSort"
import { Prisma } from "../../../generated/prisma/client"
import type { ManagedAssignment, ManagedUserFilters, ManagedUserRepository, ManagedUserRow } from "../../../server/identity/managedUsers"
import { rowsOf, type RawExecutor } from "../../auth/repositories/raw-executor"
import { careerLabelSql } from "../../../server/syllabus/syllabusSql"

const FOLD_FROM = "áéíóúüñÁÉÍÓÚÜÑ"
const FOLD_TO = "aeiouunAEIOUUN"

function accentPattern(term: string): string {
  const folded = [...term].map((character) => {
    const index = [...FOLD_FROM].indexOf(character)
    return index === -1 ? character : [...FOLD_TO][index]
  })
  return `%${folded.join("").replace(/[%_\\]/g, (character) => `\\${character}`)}%`
}

function accentMatches(column: Prisma.Sql, term: string): Prisma.Sql {
  return Prisma.sql`translate(${column}, ${Prisma.raw(`'${FOLD_FROM}'`)}, ${Prisma.raw(`'${FOLD_TO}'`)}) ILIKE ${accentPattern(term)}`
}

const NAME = Prisma.raw(`"usuarios"."nombre_usuario"`)
const EMAIL = Prisma.raw(`"usuarios"."correo_electronico"`)
const USER_ID = Prisma.raw(`"usuarios"."usuario_id"`)
const ACTIVE = Prisma.raw(`"usuarios"."usuario_activo"`)
const VERIFIED_AT = Prisma.raw(`"usuarios"."correo_verificado_en"`)

function activeRoleUsers(condition: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`${USER_ID} in (select "usuario_id" from "asignaciones_rol" where ("asignaciones_rol"."asignacion_rol_activa" = ${true} and ${condition}))`
}

function conditions(filters: ManagedUserFilters): Prisma.Sql | null {
  const where: Prisma.Sql[] = []
  if (filters.search !== null) where.push(Prisma.sql`(${accentMatches(NAME, filters.search)} or ${accentMatches(EMAIL, filters.search)})`)
  if (filters.status === "active") where.push(Prisma.sql`${ACTIVE} = ${true}`, Prisma.sql`${VERIFIED_AT} is not null`)
  if (filters.status === "pending") where.push(Prisma.sql`${ACTIVE} = ${true}`, Prisma.sql`${VERIFIED_AT} is null`)
  if (filters.status === "inactive") where.push(Prisma.sql`${ACTIVE} = ${false}`)
  if (filters.role !== null) where.push(activeRoleUsers(Prisma.sql`"asignaciones_rol"."rol" = ${filters.role}`))
  if (filters.career !== null) where.push(activeRoleUsers(Prisma.sql`"asignaciones_rol"."carrera_id" = ${filters.career}`))
  if (where.length === 0) return null
  if (where.length === 1) return where[0]
  return Prisma.sql`(${Prisma.join(where, " and ")})`
}

const whereClause = (condition: Prisma.Sql | null) => (condition === null ? Prisma.empty : Prisma.sql` where ${condition}`)

const INVITATION_ACTIVE = Prisma.sql`exists (select "invitacion_activacion_id" from "invitaciones_activacion" where ("invitaciones_activacion"."usuario_id" = "usuarios"."usuario_id" and "invitaciones_activacion"."usada_en" is null and "invitaciones_activacion"."invalidada_en" is null and "invitaciones_activacion"."expira_en" > now()))`

const statusLabel = (active: boolean, pending: boolean, expired: boolean): string =>
  managedUserStatus({ active, pending_activation: pending, invitation_expired: expired }).label

export function managedUserOrder(sort: ListSort<ManagedUserSort>): Prisma.Sql {
  if (sort === null) return Prisma.sql`${NAME} asc`
  const direction = Prisma.raw(sort.direction)
  const key =
    sort.column === "name"
      ? NAME
      : Prisma.sql`case when ${ACTIVE} = false then ${statusLabel(false, false, false)}::text
          when ${VERIFIED_AT} is null then case when ${INVITATION_ACTIVE} then ${statusLabel(true, true, false)}::text else ${statusLabel(true, true, true)}::text end
          else ${statusLabel(true, false, false)}::text end`
  return Prisma.sql`${key} ${direction} nulls last, ${NAME} asc, ${USER_ID} asc`
}

type UserRow = Omit<ManagedUserRow, "assignments">
type AssignmentRow = ManagedAssignment & { userId: string }

export function managedUserRepositoryOn(executor: RawExecutor): ManagedUserRepository {
  return {
    async page(filters, page, perPage, sort = null) {
      const where = whereClause(conditions(filters))
      const [counted] = await rowsOf<{ count: bigint | number | string }>(executor, Prisma.sql`select count(*) as count from "usuarios"${where}`)
      const total = Number(counted?.count ?? 0)
      if (total === 0) return { total: 0, items: [] }
      const offset = (page - 1) * perPage
      const users = await rowsOf<UserRow>(
        executor,
        Prisma.sql`select "usuario_id" as "id", "nombre_usuario" as "name", "correo_electronico" as "email", "usuario_activo" as "active", "correo_verificado_en" is not null as "verified", "dos_factores_confirmado_en" is not null as "twoFactor", ${INVITATION_ACTIVE} as "invitationActive" from "usuarios"${where} order by ${managedUserOrder(sort)} limit ${perPage}${offset > 0 ? Prisma.sql` offset ${offset}` : Prisma.empty}`,
      )
      const assignments =
        users.length === 0
          ? []
          : await rowsOf<AssignmentRow>(
              executor,
              Prisma.sql`select "asignaciones_rol"."usuario_id" as "userId", "asignaciones_rol"."asignacion_rol_id" as "id", "asignaciones_rol"."rol" as "role", case when "carreras"."carrera_id" is null then null else ${careerLabelSql("carreras")} end as "careerLabel", "asignaciones_rol"."asignacion_rol_activa" as "active" from "asignaciones_rol" left join "carreras" on "carreras"."carrera_id" = "asignaciones_rol"."carrera_id" where "asignaciones_rol"."usuario_id" in (${Prisma.join(users.map((user) => user.id), ", ")}) order by "asignaciones_rol"."asignado_en" desc`,
            )
      return {
        total,
        items: users.map(
          (user): ManagedUserRow => ({
            ...user,
            assignments: assignments.filter((assignment) => assignment.userId === user.id).map(({ id, role, careerLabel, active }) => ({ id, role, careerLabel, active })),
          }),
        ),
      }
    },
    careers: () =>
      rowsOf<{ id: string; nombre: string }>(
        executor,
        Prisma.sql`select "carrera_id" as "id", ${careerLabelSql("carreras")} as "nombre" from "carreras" where "carreras"."carrera_activa" = ${true} order by "carreras"."nombre_carrera" asc, "carreras"."codigo_carrera" asc`,
      ),
  }
}
