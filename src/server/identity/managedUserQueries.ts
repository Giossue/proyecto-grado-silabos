import "server-only"
import { and, asc, desc, eq, exists, gt, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm"
import { db, type Executor } from "@/db"
import { asignacionesRol, carreras, invitacionesActivacion, usuarios } from "@/db/schema"
import { managedUserStatus } from "@/lib/managedUserStatus"
import type { ListSort, ManagedUserSort } from "@/schemas/listSort"
import { careerLabelSql } from "../academic/careerLabel"
import { accentMatches } from "../http/sql"
import type { ManagedUserFilters, ManagedUserRepository, ManagedUserRow } from "./managedUsers"

function activeRoleUsers(executor: Executor, condition: SQL): SQL {
  return inArray(
    usuarios.usuarioId,
    executor
      .select({ id: asignacionesRol.usuarioId })
      .from(asignacionesRol)
      .where(and(eq(asignacionesRol.asignacionRolActiva, true), condition)),
  )
}

function conditions(executor: Executor, filters: ManagedUserFilters): SQL | undefined {
  const where: (SQL | undefined)[] = []
  if (filters.search !== null) {
    where.push(or(accentMatches(sql`${usuarios.nombreUsuario}`, filters.search), accentMatches(sql`${usuarios.correoElectronico}`, filters.search)))
  }
  if (filters.status === "active") where.push(eq(usuarios.usuarioActivo, true), isNotNull(usuarios.correoVerificadoEn))
  if (filters.status === "pending") where.push(eq(usuarios.usuarioActivo, true), isNull(usuarios.correoVerificadoEn))
  if (filters.status === "inactive") where.push(eq(usuarios.usuarioActivo, false))
  if (filters.role !== null) where.push(activeRoleUsers(executor, eq(asignacionesRol.rol, filters.role)))
  if (filters.career !== null) where.push(activeRoleUsers(executor, eq(asignacionesRol.carreraId, filters.career)))
  return and(...where)
}

function invitationActive(executor: Executor): SQL {
  return exists(
    executor
      .select({ id: invitacionesActivacion.invitacionActivacionId })
      .from(invitacionesActivacion)
      .where(
        and(
          eq(invitacionesActivacion.usuarioId, usuarios.usuarioId),
          isNull(invitacionesActivacion.usadaEn),
          isNull(invitacionesActivacion.invalidadaEn),
          gt(invitacionesActivacion.expiraEn, sql`now()`),
        ),
      ),
  )
}

const statusLabel = (active: boolean, pending: boolean, expired: boolean): string =>
  managedUserStatus({ active, pending_activation: pending, invitation_expired: expired }).label

export function managedUserOrder(executor: Executor, sort: ListSort<ManagedUserSort>): SQL[] {
  if (sort === null) return [asc(usuarios.nombreUsuario)]
  const direction = sql.raw(sort.direction)
  const key =
    sort.column === "name"
      ? sql`${usuarios.nombreUsuario}`
      : sql`case when ${usuarios.usuarioActivo} = false then ${statusLabel(false, false, false)}::text
          when ${usuarios.correoVerificadoEn} is null then case when ${invitationActive(executor)} then ${statusLabel(true, true, false)}::text else ${statusLabel(true, true, true)}::text end
          else ${statusLabel(true, false, false)}::text end`
  return [sql`${key} ${direction} nulls last`, asc(usuarios.nombreUsuario), asc(usuarios.usuarioId)]
}

export function managedUserRepositoryOn(executor: Executor): ManagedUserRepository {
  return {
    async page(filters, page, perPage, sort = null) {
      const where = conditions(executor, filters)
      const total = await executor.$count(usuarios, where)
      if (total === 0) return { total: 0, items: [] }
      const users = await executor
        .select({
          id: usuarios.usuarioId,
          name: usuarios.nombreUsuario,
          email: usuarios.correoElectronico,
          active: usuarios.usuarioActivo,
          verified: isNotNull(usuarios.correoVerificadoEn).mapWith(Boolean),
          twoFactor: isNotNull(usuarios.dosFactoresConfirmadoEn).mapWith(Boolean),
          invitationActive: sql<boolean>`${invitationActive(executor)}`,
        })
        .from(usuarios)
        .where(where)
        .orderBy(...managedUserOrder(executor, sort))
        .limit(perPage)
        .offset((page - 1) * perPage)
      const assignments =
        users.length === 0
          ? []
          : await executor
              .select({
                userId: asignacionesRol.usuarioId,
                id: asignacionesRol.asignacionRolId,
                role: asignacionesRol.rol,
                careerLabel: sql<string | null>`case when ${carreras.carreraId} is null then null else ${careerLabelSql("carreras")} end`,
                active: asignacionesRol.asignacionRolActiva,
              })
              .from(asignacionesRol)
              .leftJoin(carreras, eq(carreras.carreraId, asignacionesRol.carreraId))
              .where(
                inArray(
                  asignacionesRol.usuarioId,
                  users.map((user) => user.id),
                ),
              )
              .orderBy(desc(asignacionesRol.asignadoEn))
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
      executor
        .select({ id: carreras.carreraId, nombre: sql<string>`${careerLabelSql("carreras")}` })
        .from(carreras)
        .where(eq(carreras.carreraActiva, true))
        .orderBy(asc(carreras.nombreCarrera), asc(carreras.codigoCarrera)),
  }
}

export function createManagedUserRepository(): ManagedUserRepository {
  return managedUserRepositoryOn(db)
}
