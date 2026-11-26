import { notificationScope } from "../notifications/queries"
import { returnApprovals } from "../syllabus/coordinationHandover"
import { FinalizedChangeNotice } from "../syllabus/finalizedChangeNotice"
import { InProgressWork } from "../syllabus/inProgressWork"
import { Prisma } from "../../generated/prisma/client"
import { inTransaction, type Db } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import { fromEpoch, hasRows } from "../../prisma/sql"
import { careerLabelSql } from "../syllabus/syllabusSql"
import { CREDENTIAL_PROVIDER } from "../auth/credentialProvider"
import { uuid7 } from "../http/uuid7"
import type { Account, AccountRepository, AccountTx, RoleGrant } from "./accounts"

const ACCOUNT = Prisma.sql`select "usuario_id" as "id", "nombre_usuario" as "name", "correo_electronico" as "email", "usuario_activo" as "active", "correo_verificado_en" is not null as "verified" from "usuarios"`
const GRANT = Prisma.sql`select "asignacion_rol_id" as "id", "usuario_id" as "userId", "rol" as "role", "carrera_id" as "careerId", "asignacion_rol_activa" as "active" from "asignaciones_rol"`
const ACTIVE_GRANT = Prisma.sql`"asignaciones_rol"."asignacion_rol_activa" = ${true}`
const PENDING_INVITATION = Prisma.sql`("invitaciones_activacion"."usada_en" is null and "invitaciones_activacion"."invalidada_en" is null)`
const careerLabel = careerLabelSql("carreras")

const careerMatch = (careerId: string | null) =>
  careerId === null ? Prisma.sql`"asignaciones_rol"."carrera_id" is null` : Prisma.sql`"asignaciones_rol"."carrera_id" = ${careerId}`

const grantsOf = (userId: string) => Prisma.sql`(select "asignacion_rol_id" from "asignaciones_rol" where "asignaciones_rol"."usuario_id" = ${userId})`

function rows<T>(db: Db, query: Prisma.Sql): Promise<T[]> {
  return db.$queryRaw<T[]>(query)
}

async function first<T>(db: Db, query: Prisma.Sql): Promise<T | null> {
  return (await rows<T>(db, query))[0] ?? null
}

async function careerLabelOf(db: Db, careerId: string): Promise<string | null> {
  const row = await first<{ label: unknown }>(db, Prisma.sql`select ${careerLabel} as "label" from "carreras" where "carreras"."carrera_id" = ${careerId}`)
  return row ? String(row.label) : null
}

export function accountTx(db: Db): AccountTx {
  let savepoints = 0
  const tx: AccountTx = {
    async nested(work) {
      savepoints += 1
      const name = Prisma.raw(`identity_${savepoints}`)
      await db.$executeRaw`savepoint ${name}`
      try {
        const result = await work()
        await db.$executeRaw`release savepoint ${name}`
        return result
      } catch (error) {
        await db.$executeRaw`rollback to savepoint ${name}`
        throw error
      }
    },
    lockAccount: (id) => first<Account>(db, Prisma.sql`${ACCOUNT} where "usuarios"."usuario_id" = ${id} limit ${1} for update`),
    lockAccountByEmail: (email) => first<Account>(db, Prisma.sql`${ACCOUNT} where lower("usuarios"."correo_electronico") = ${email} limit ${1} for update`),
    async insertAccount(account) {
      const id = uuid7()
      await db.$executeRaw`insert into "usuarios" ("usuario_id", "nombre_usuario", "correo_electronico", "correo_verificado_en", "contrasena", "usuario_activo") values (${id}, ${account.name}, ${account.email}, ${null}, ${account.passwordHash}, ${true})`
      await db.$executeRaw`insert into "cuentas_usuario" ("id", "account_id", "provider_id", "user_id", "password") values (${uuid7()}, ${id}, ${CREDENTIAL_PROVIDER}, ${id}, ${account.passwordHash})`
      return { id, name: account.name, email: account.email, active: true, verified: false }
    },
    async updateIdentity(id, name, email) {
      await db.$executeRaw`update "usuarios" set "nombre_usuario" = ${name}, "correo_electronico" = ${email} where "usuarios"."usuario_id" = ${id}`
    },
    async setActive(id, active) {
      await db.$executeRaw`update "usuarios" set "usuario_activo" = ${active} where "usuarios"."usuario_id" = ${id}`
    },
    async lockFormation(id) {
      const row = await first<{ formation: string | null }>(
        db,
        Prisma.sql`select "formacion_experiencia_usuario" as "formation" from "usuarios" where "usuarios"."usuario_id" = ${id} limit ${1} for update`,
      )
      return row ? { formation: row.formation ?? null } : null
    },
    async setFormation(id, formation) {
      await db.$executeRaw`update "usuarios" set "formacion_experiencia_usuario" = ${formation} where "usuarios"."usuario_id" = ${id}`
    },
    async setAccessibility(id, preferences) {
      await db.$executeRaw`update "usuarios" set "preferencias_accesibilidad_usuario" = ${JSON.stringify(preferences)} where "usuarios"."usuario_id" = ${id}`
    },
    async effectiveRoles(userId) {
      const found = await rows<{ role: string }>(
        db,
        Prisma.sql`select "rol" as "role" from "asignaciones_rol" where ("asignaciones_rol"."usuario_id" = ${userId} and ${ACTIVE_GRANT})`,
      )
      return found.map((row) => row.role)
    },
    lockEffectiveGrants: (userId) => rows<RoleGrant>(db, Prisma.sql`${GRANT} where ("asignaciones_rol"."usuario_id" = ${userId} and ${ACTIVE_GRANT}) for update`),
    lockCurrentCoordinator: (careerId, exceptUserId) =>
      first<{ grantId: string; userId: string; userName: string }>(
        db,
        Prisma.sql`select "asignaciones_rol"."asignacion_rol_id" as "grantId", "asignaciones_rol"."usuario_id" as "userId", "usuarios"."nombre_usuario" as "userName" from "asignaciones_rol" inner join "usuarios" on ("usuarios"."usuario_id" = "asignaciones_rol"."usuario_id" and "usuarios"."usuario_activo" = ${true}) where (${ACTIVE_GRANT} and ${careerMatch(careerId)} and "asignaciones_rol"."usuario_id" <> ${exceptUserId} and "asignaciones_rol"."rol" = ${"coordinador"}) limit ${1} for update of "asignaciones_rol"`,
      ),
    async guardHandover(careerId, confirmed, afterCommit, now) {
      const work = new InProgressWork(db, afterCommit, notificationScope(db, afterCommit, now))
      await new FinalizedChangeNotice(work, now).guardHandover(confirmed, careerId)
    },
    async returnApprovals(careerId, afterCommit, now) {
      const work = new InProgressWork(db, afterCommit, notificationScope(db, afterCommit, now))
      return returnApprovals(db, afterCommit, careerId, (where) => work.syllabi(where, { lock: true }))
    },
    findGrant: (userId, role, careerId, activeFirst) =>
      first<RoleGrant>(
        db,
        Prisma.sql`${GRANT} where ("asignaciones_rol"."usuario_id" = ${userId} and "asignaciones_rol"."rol" = ${role} and ${careerMatch(careerId)})${activeFirst ? Prisma.sql` order by "asignaciones_rol"."asignacion_rol_activa" desc` : Prisma.empty} limit ${1}`,
      ),
    lockActiveGrant: (userId, role, careerId) =>
      first<RoleGrant>(
        db,
        Prisma.sql`${GRANT} where ("asignaciones_rol"."usuario_id" = ${userId} and "asignaciones_rol"."rol" = ${role} and "asignaciones_rol"."carrera_id" = ${careerId} and ${ACTIVE_GRANT}) limit ${1} for update`,
      ),
    async insertGrant(userId, role, careerId, at) {
      const id = uuid7()
      await db.$executeRaw`insert into "asignaciones_rol" ("asignacion_rol_id", "usuario_id", "carrera_id", "asignacion_rol_activa", "asignado_en", "rol") values (${id}, ${userId}, ${careerId}, ${true}, ${fromEpoch(at)}, ${role})`
      return { id, userId, role, careerId, active: true }
    },
    async setGrantActive(id, active) {
      await db.$executeRaw`update "asignaciones_rol" set "asignacion_rol_activa" = ${active} where "asignaciones_rol"."asignacion_rol_id" = ${id}`
    },
    async invitationRole(userId) {
      const row = await first<{ role: string; careerId: string | null }>(
        db,
        Prisma.sql`select "rol" as "role", "carrera_id" as "careerId" from "asignaciones_rol" where ("asignaciones_rol"."usuario_id" = ${userId} and ${ACTIVE_GRANT}) limit ${1}`,
      )
      if (!row) return null
      if (row.careerId === null) return { role: row.role, careerLabel: null }
      return { role: row.role, careerLabel: await careerLabelOf(db, row.careerId) }
    },
    async lockActiveParallelAssignments(grantId) {
      const found = await rows<{ id: string }>(
        db,
        Prisma.sql`select "asignacion_paralelo_id" as "id" from "asignaciones_paralelo" where ("asignaciones_paralelo"."asignacion_rol_id" = ${grantId} and "asignaciones_paralelo"."asignacion_paralelo_activa" = ${true}) for update`,
      )
      return found.map((row) => row.id)
    },
    async deleteParallelAssignment(id) {
      await db.$executeRaw`delete from "asignaciones_paralelo" where "asignaciones_paralelo"."asignacion_paralelo_id" = ${id}`
    },
    closeParallelAssignments: (userId) =>
      db.$executeRaw`update "asignaciones_paralelo" set "asignacion_paralelo_activa" = ${false} where ("asignaciones_paralelo"."asignacion_rol_id" in ${grantsOf(userId)} and "asignaciones_paralelo"."asignacion_paralelo_activa" = ${true})`,
    async lockEffectiveCoordinations(userId) {
      const found = await rows<{ id: string; careerId: string | null; label: unknown }>(
        db,
        Prisma.sql`select "asignaciones_rol"."asignacion_rol_id" as "id", "asignaciones_rol"."carrera_id" as "careerId", ${careerLabel} as "label" from "asignaciones_rol" left join "carreras" on "carreras"."carrera_id" = "asignaciones_rol"."carrera_id" where (${ACTIVE_GRANT} and "asignaciones_rol"."usuario_id" = ${userId} and "asignaciones_rol"."rol" = ${"coordinador"}) for update of "asignaciones_rol"`,
      )
      return found.map((row) => ({ id: row.id, label: String(row.label ?? row.careerId ?? "") }))
    },
    isEffectiveAdministrator: (userId) =>
      hasRows(
        rows(
          db,
          Prisma.sql`select "asignacion_rol_id" from "asignaciones_rol" where (${ACTIVE_GRANT} and "asignaciones_rol"."usuario_id" = ${userId} and "asignaciones_rol"."rol" = ${"administrador"}) limit ${1}`,
        ),
      ),
    otherActiveAdministratorExists: (userId) =>
      hasRows(
        rows(
          db,
          Prisma.sql`select "asignacion_rol_id" from "asignaciones_rol" where (${ACTIVE_GRANT} and "asignaciones_rol"."usuario_id" <> ${userId} and "asignaciones_rol"."rol" = ${"administrador"} and exists (select "usuario_id" from "usuarios" where ("asignaciones_rol"."usuario_id" = "usuarios"."usuario_id" and "usuarios"."usuario_activo" = ${true}))) limit ${1}`,
        ),
      ),
    async syllabiInProgress(userId) {
      const found = await rows<{ careerId: string; total: bigint | number }>(
        db,
        Prisma.sql`select "carreras"."carrera_id" as "careerId", count(distinct "silabos"."silabo_id") as "total" from "docentes_vigentes_silabo" inner join "silabos" on "silabos"."silabo_id" = "docentes_vigentes_silabo"."silabo_id" inner join "convocatorias_carreras" on "convocatorias_carreras"."convocatoria_carrera_id" = "silabos"."convocatoria_carrera_id" inner join "carreras" on "carreras"."carrera_id" = "convocatorias_carreras"."carrera_id" where ("docentes_vigentes_silabo"."usuario_id" = ${userId} and "silabos"."estado_silabo" in (${"borrador"}, ${"en_revision"}, ${"correccion_solicitada"}) and "convocatorias_carreras"."estado_convocatoria_carrera" = ${"abierta"}) group by "carreras"."carrera_id"`,
      )
      const result: { careerLabel: string; total: number }[] = []
      for (const row of found) result.push({ careerLabel: (await careerLabelOf(db, row.careerId)) ?? "", total: Number(row.total) })
      return result
    },
    hasActiveInvitation: (userId, now) =>
      hasRows(
        rows(
          db,
          Prisma.sql`select "invitacion_activacion_id" from "invitaciones_activacion" where ("invitaciones_activacion"."usuario_id" = ${userId} and ${PENDING_INVITATION} and "invitaciones_activacion"."expira_en" > ${fromEpoch(now)}) limit ${1}`,
        ),
      ),
    async invalidateInvitations(userId, now) {
      await db.$executeRaw`update "invitaciones_activacion" set "invalidada_en" = ${fromEpoch(now)} where ("invitaciones_activacion"."usuario_id" = ${userId} and ${PENDING_INVITATION})`
    },
    async insertInvitation(invitation) {
      await db.$executeRaw`insert into "invitaciones_activacion" ("invitacion_activacion_id", "usuario_id", "hash_activacion", "expira_en", "emitida_por_usuario_id", "creada_en") values (${uuid7()}, ${invitation.userId}, ${invitation.hash}, ${fromEpoch(invitation.expiresAt)}, ${invitation.issuerId}, ${fromEpoch(invitation.createdAt)})`
    },
    async latestInvitationIssuer(userId) {
      const row = await first<{ issuerId: string | null }>(
        db,
        Prisma.sql`select "emitida_por_usuario_id" as "issuerId" from "invitaciones_activacion" where "invitaciones_activacion"."usuario_id" = ${userId} order by "invitaciones_activacion"."creada_en" desc limit ${1}`,
      )
      if (!row || row.issuerId === null) return null
      return first<Account>(db, Prisma.sql`${ACCOUNT} where "usuarios"."usuario_id" = ${row.issuerId} limit ${1}`)
    },
    deleteSessions: (userId, exceptId) =>
      exceptId === null
        ? db.$executeRaw`delete from "sesiones_usuario" where "sesiones_usuario"."user_id" = ${userId}`
        : db.$executeRaw`delete from "sesiones_usuario" where ("sesiones_usuario"."user_id" = ${userId} and "sesiones_usuario"."id" <> ${exceptId})`,
    async deleteSession(id, userId) {
      await db.$executeRaw`delete from "sesiones_usuario" where ("sesiones_usuario"."id" = ${id} and "sesiones_usuario"."user_id" = ${userId})`
    },
    async hasActivity(userId) {
      const traces = [
        () => Prisma.sql`select "asignacion_paralelo_id" from "asignaciones_paralelo" where "asignaciones_paralelo"."asignacion_rol_id" in ${grantsOf(userId)}`,
        () => Prisma.sql`select "revision_silabo_id" from "revisiones_silabo" where "revisiones_silabo"."enviado_por" = ${userId}`,
        () => Prisma.sql`select "exportacion_silabo_id" from "exportaciones_silabo" where "exportaciones_silabo"."solicitado_por" = ${userId}`,
        () => Prisma.sql`select "archivo_id" from "archivos" where "archivos"."subido_por" = ${userId}`,
        () => Prisma.sql`select "firma_silabo_id" from "firmas_silabo" where "firmas_silabo"."usuario_id" = ${userId}`,
      ]
      for (const trace of traces) if (await hasRows(rows(db, Prisma.sql`${trace()} limit ${1}`))) return true
      return false
    },
    async purgeAccount(userId) {
      await db.$executeRaw`delete from "notificaciones" where "notificaciones"."usuario_id" = ${userId}`
      await db.$executeRaw`delete from "sesiones_usuario" where "sesiones_usuario"."user_id" = ${userId}`
      await db.$executeRaw`delete from "asignaciones_rol" where "asignaciones_rol"."usuario_id" = ${userId}`
      await db.$executeRaw`delete from "usuarios" where "usuarios"."usuario_id" = ${userId}`
    },
    careerLocked: (careerId) =>
      hasRows(
        rows(
          db,
          Prisma.sql`select "convocatoria_carrera_id" from "convocatorias_carreras" where ("convocatorias_carreras"."carrera_id" = ${careerId} and "convocatorias_carreras"."estado_convocatoria_carrera" = ${"abierta"} and exists (select "convocatoria_universidad_id" from "convocatorias_universidad" where ("convocatorias_carreras"."convocatoria_universidad_id" = "convocatorias_universidad"."convocatoria_universidad_id" and "convocatorias_universidad"."estado_convocatoria_universidad" in (${"abierto"}, ${"pausado"})))) limit ${1}`,
        ),
      ),
  }
  return tx
}

async function counted(db: Db, query: Prisma.Sql): Promise<number> {
  const [row] = await rows<{ count: bigint | number | string }>(db, query)
  return Number(row?.count ?? 0)
}

export function accountRepositoryOn(db: Db, transaction: <T>(work: (tx: AccountTx) => Promise<T>) => Promise<T>): AccountRepository {
  return {
    findAccount: (id) => first<Account>(db, Prisma.sql`${ACCOUNT} where "usuarios"."usuario_id" = ${id} limit ${1}`),
    findGrant: (id) => first<RoleGrant>(db, Prisma.sql`${GRANT} where "asignaciones_rol"."asignacion_rol_id" = ${id} limit ${1}`),
    async emailTaken(email, ignoreUserId) {
      const where =
        ignoreUserId === null
          ? Prisma.sql`"usuarios"."correo_electronico" = ${email}`
          : Prisma.sql`("usuarios"."correo_electronico" = ${email} and "usuarios"."usuario_id" <> ${ignoreUserId})`
      return (await counted(db, Prisma.sql`select count(*) as count from "usuarios" where ${where}`)) > 0
    },
    async activeCareer(id) {
      return (await counted(db, Prisma.sql`select count(*) as count from "carreras" where ("carreras"."carrera_id" = ${id} and "carreras"."carrera_activa" = ${true})`)) > 0
    },
    hasEffectiveRole: (userId, role, careerId) =>
      hasRows(
        rows(
          db,
          Prisma.sql`select "asignacion_rol_id" from "asignaciones_rol" where ("asignaciones_rol"."usuario_id" = ${userId} and ${ACTIVE_GRANT} and "asignaciones_rol"."rol" = ${role} and "asignaciones_rol"."carrera_id" = ${careerId}) limit ${1}`,
        ),
      ),
    direct: (work) => work(accountTx(db)),
    transaction,
  }
}

export function createAccountRepository(prisma: PrismaService): AccountRepository {
  return accountRepositoryOn(prisma, (work) => inTransaction(prisma, (tx) => work(accountTx(tx))))
}
