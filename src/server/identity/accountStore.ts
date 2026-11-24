import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import { careerLabelSql } from "../academic/careerLabel"
import { uuid7 } from "../laravel/uuid7"
import type { Account, AccountRepository, AccountTx, RoleGrant } from "./accounts"

type Row = Record<string, unknown>
export type AccountExecutor = { execute(query: SQL): Promise<{ rows: unknown[]; rowCount?: number | null }> }

const ACCOUNT_COLUMNS = sql.raw(
  "usuario_id, nombre_usuario, correo_electronico, usuario_activo, correo_verificado_en is not null as verified",
)
const GRANT_COLUMNS = sql.raw("asignacion_rol_id, usuario_id, rol, carrera_id, asignacion_rol_activa")

function toAccount(row: Row | undefined): Account | null {
  if (!row) return null
  return {
    id: String(row.usuario_id),
    name: String(row.nombre_usuario),
    email: String(row.correo_electronico),
    active: row.usuario_activo === true,
    verified: row.verified === true,
  }
}

function toGrant(row: Row | undefined): RoleGrant | null {
  if (!row) return null
  return {
    id: String(row.asignacion_rol_id),
    userId: String(row.usuario_id),
    role: String(row.rol),
    careerId: row.carrera_id === null ? null : String(row.carrera_id),
    active: row.asignacion_rol_activa === true,
  }
}

const careerMatch = (careerId: string | null) => (careerId === null ? sql`carrera_id is null` : sql`carrera_id = ${careerId}::uuid`)

export function accountTx(executor: AccountExecutor): AccountTx {
  const rows = async (query: SQL) => (await executor.execute(query)).rows as Row[]
  const count = async (query: SQL) => (await executor.execute(query)).rowCount ?? 0
  const exists = async (query: SQL) => (await rows(sql`select exists(${query}) as found`))[0]?.found === true
  let savepoints = 0
  const tx: AccountTx = {
    async nested(work) {
      savepoints += 1
      const name = sql.raw(`identity_${savepoints}`)
      await executor.execute(sql`savepoint ${name}`)
      try {
        const result = await work()
        await executor.execute(sql`release savepoint ${name}`)
        return result
      } catch (error) {
        await executor.execute(sql`rollback to savepoint ${name}`)
        throw error
      }
    },
    async lockAccount(id) {
      return toAccount((await rows(sql`select ${ACCOUNT_COLUMNS} from usuarios where usuario_id = ${id}::uuid limit 1 for update`))[0])
    },
    async lockAccountByEmail(email) {
      return toAccount((await rows(sql`select ${ACCOUNT_COLUMNS} from usuarios where lower(correo_electronico) = ${email} limit 1 for update`))[0])
    },
    async insertAccount(account) {
      const id = uuid7()
      await executor.execute(sql`insert into usuarios (usuario_id, nombre_usuario, correo_electronico, contrasena, usuario_activo, correo_verificado_en)
        values (${id}::uuid, ${account.name}, ${account.email}, ${account.passwordHash}, true, null)`)
      return { id, name: account.name, email: account.email, active: true, verified: false }
    },
    async updateIdentity(id, name, email) {
      await executor.execute(sql`update usuarios set nombre_usuario = ${name}, correo_electronico = ${email} where usuario_id = ${id}::uuid`)
    },
    async setActive(id, active) {
      await executor.execute(sql`update usuarios set usuario_activo = ${active} where usuario_id = ${id}::uuid`)
    },
    async setRememberToken(id, token) {
      await executor.execute(sql`update usuarios set codigo_recordarme = ${token} where usuario_id = ${id}::uuid`)
    },
    async lockFormation(id) {
      const [row] = await rows(sql`select formacion_experiencia_usuario from usuarios where usuario_id = ${id}::uuid limit 1 for update`)
      return row ? { formation: (row.formacion_experiencia_usuario as string | null) ?? null } : null
    },
    async setFormation(id, formation) {
      await executor.execute(sql`update usuarios set formacion_experiencia_usuario = ${formation} where usuario_id = ${id}::uuid`)
    },
    async setAccessibility(id, preferences) {
      await executor.execute(sql`update usuarios set preferencias_accesibilidad_usuario = ${JSON.stringify(preferences)}::jsonb where usuario_id = ${id}::uuid`)
    },
    async effectiveRoles(userId) {
      return (await rows(sql`select rol from asignaciones_rol where usuario_id = ${userId}::uuid and asignacion_rol_activa = true`)).map((row) => String(row.rol))
    },
    async lockEffectiveGrants(userId) {
      const found = await rows(sql`select ${GRANT_COLUMNS} from asignaciones_rol where usuario_id = ${userId}::uuid and asignacion_rol_activa = true for update`)
      return found.map((row) => toGrant(row) as RoleGrant)
    },
    async lockCurrentCoordinator(careerId, exceptUserId) {
      const [row] = await rows(sql`select asignacion.asignacion_rol_id, asignacion.usuario_id,
          (select nombre_usuario from usuarios where usuarios.usuario_id = asignacion.usuario_id) as nombre_usuario
        from asignaciones_rol asignacion
        where asignacion.asignacion_rol_activa = true and asignacion.${careerMatch(careerId)} and asignacion.usuario_id <> ${exceptUserId}::uuid
          and exists (select * from usuarios where asignacion.usuario_id = usuarios.usuario_id and usuario_activo = true)
          and asignacion.rol = 'coordinador'
        limit 1 for update of asignacion`)
      return row ? { grantId: String(row.asignacion_rol_id), userId: String(row.usuario_id), userName: String(row.nombre_usuario) } : null
    },
    async careerHasReviewedSyllabi(careerId) {
      if (careerId === null) return false
      return exists(sql`select 1 from silabos
        inner join convocatorias_carreras on convocatorias_carreras.convocatoria_carrera_id = silabos.convocatoria_carrera_id
        where convocatorias_carreras.carrera_id = ${careerId}::uuid and silabos.estado_silabo in ('en_revision', 'aprobado')`)
    },
    async findGrant(userId, role, careerId, activeFirst) {
      const order = activeFirst ? sql` order by asignacion_rol_activa desc` : sql``
      return toGrant(
        (await rows(sql`select ${GRANT_COLUMNS} from asignaciones_rol where usuario_id = ${userId}::uuid and rol = ${role} and ${careerMatch(careerId)}${order} limit 1`))[0],
      )
    },
    async lockActiveGrant(userId, role, careerId) {
      return toGrant(
        (
          await rows(sql`select ${GRANT_COLUMNS} from asignaciones_rol where usuario_id = ${userId}::uuid and rol = ${role}
            and carrera_id = ${careerId}::uuid and asignacion_rol_activa = true limit 1 for update`)
        )[0],
      )
    },
    async insertGrant(userId, role, careerId, at) {
      const id = uuid7()
      await executor.execute(sql`insert into asignaciones_rol (asignacion_rol_id, usuario_id, rol, carrera_id, asignacion_rol_activa, asignado_en)
        values (${id}::uuid, ${userId}::uuid, ${role}, ${careerId}::uuid, true, to_timestamp(${at}))`)
      return { id, userId, role, careerId, active: true }
    },
    async setGrantActive(id, active) {
      await executor.execute(sql`update asignaciones_rol set asignacion_rol_activa = ${active} where asignacion_rol_id = ${id}::uuid`)
    },
    async invitationRole(userId) {
      const [row] = await rows(sql`select rol, carrera_id from asignaciones_rol where usuario_id = ${userId}::uuid and asignacion_rol_activa = true limit 1`)
      if (!row) return null
      if (row.carrera_id === null) return { role: String(row.rol), careerLabel: null }
      const [career] = await rows(sql`select ${careerLabelSql("carrera")} as label from carreras carrera where carrera.carrera_id = ${String(row.carrera_id)}::uuid`)
      return { role: String(row.rol), careerLabel: career ? String(career.label) : null }
    },
    async lockActiveParallelAssignments(grantId) {
      const found = await rows(sql`select asignacion_paralelo_id from asignaciones_paralelo
        where asignacion_rol_id = ${grantId}::uuid and asignacion_paralelo_activa = true for update`)
      return found.map((row) => String(row.asignacion_paralelo_id))
    },
    async deleteParallelAssignment(id) {
      await executor.execute(sql`delete from asignaciones_paralelo where asignacion_paralelo_id = ${id}::uuid`)
    },
    async closeParallelAssignments(userId) {
      return count(sql`update asignaciones_paralelo set asignacion_paralelo_activa = false
        where asignacion_rol_id in (select asignacion_rol_id from asignaciones_rol where usuario_id = ${userId}::uuid)
          and asignacion_paralelo_activa = true`)
    },
    async lockEffectiveCoordinations(userId) {
      const found = await rows(sql`select asignacion.asignacion_rol_id, asignacion.carrera_id,
          (select ${careerLabelSql("carrera")} from carreras carrera where carrera.carrera_id = asignacion.carrera_id) as label
        from asignaciones_rol asignacion
        where asignacion.asignacion_rol_activa = true and asignacion.usuario_id = ${userId}::uuid and asignacion.rol = 'coordinador'
        for update of asignacion`)
      return found.map((row) => ({ id: String(row.asignacion_rol_id), label: String(row.label ?? row.carrera_id ?? "") }))
    },
    async isEffectiveAdministrator(userId) {
      return exists(sql`select * from asignaciones_rol where asignacion_rol_activa = true and usuario_id = ${userId}::uuid and rol = 'administrador'`)
    },
    async otherActiveAdministratorExists(userId) {
      return exists(sql`select * from asignaciones_rol where asignacion_rol_activa = true and usuario_id <> ${userId}::uuid and rol = 'administrador'
        and exists (select * from usuarios where asignaciones_rol.usuario_id = usuarios.usuario_id and usuario_activo = true)`)
    },
    async syllabiInProgress(userId) {
      const found = await rows(sql`select carreras.carrera_id as carrera_id, count(distinct silabos.silabo_id) as total
        from docentes_vigentes_silabo
        inner join silabos on silabos.silabo_id = docentes_vigentes_silabo.silabo_id
        inner join convocatorias_carreras on convocatorias_carreras.convocatoria_carrera_id = silabos.convocatoria_carrera_id
        inner join carreras on carreras.carrera_id = convocatorias_carreras.carrera_id
        where docentes_vigentes_silabo.usuario_id = ${userId}::uuid
          and silabos.estado_silabo in ('borrador', 'en_revision', 'correccion_solicitada')
          and convocatorias_carreras.estado_convocatoria_carrera = 'abierta'
        group by carreras.carrera_id`)
      const result: { careerLabel: string; total: number }[] = []
      for (const row of found) {
        const [career] = await rows(sql`select ${careerLabelSql("carrera")} as label from carreras carrera where carrera.carrera_id = ${String(row.carrera_id)}::uuid`)
        result.push({ careerLabel: career ? String(career.label) : "", total: Number(row.total) })
      }
      return result
    },
    async hasActiveInvitation(userId, now) {
      return exists(sql`select * from invitaciones_activacion where usuario_id = ${userId}::uuid and usada_en is null and invalidada_en is null
        and expira_en > to_timestamp(${now})`)
    },
    async invalidateInvitations(userId, now) {
      await executor.execute(sql`update invitaciones_activacion set invalidada_en = to_timestamp(${now})
        where usuario_id = ${userId}::uuid and usada_en is null and invalidada_en is null`)
    },
    async insertInvitation(invitation) {
      await executor.execute(sql`insert into invitaciones_activacion
          (invitacion_activacion_id, usuario_id, hash_activacion, expira_en, emitida_por_usuario_id, creada_en)
        values (${uuid7()}::uuid, ${invitation.userId}::uuid, ${invitation.hash}, to_timestamp(${invitation.expiresAt}),
          ${invitation.issuerId}::uuid, to_timestamp(${invitation.createdAt}))`)
    },
    async latestInvitationIssuer(userId) {
      const [row] = await rows(sql`select emitida_por_usuario_id from invitaciones_activacion where usuario_id = ${userId}::uuid order by creada_en desc limit 1`)
      if (!row || row.emitida_por_usuario_id === null) return null
      return toAccount((await rows(sql`select ${ACCOUNT_COLUMNS} from usuarios where usuario_id = ${String(row.emitida_por_usuario_id)}::uuid limit 1`))[0])
    },
    async deleteSessions(userId, exceptId) {
      const except = exceptId === null ? sql`` : sql` and id <> ${exceptId}`
      return count(sql`delete from sesiones where user_id = ${userId}::uuid${except}`)
    },
    async deleteSession(id, userId) {
      await executor.execute(sql`delete from sesiones where id = ${id} and user_id = ${userId}::uuid`)
    },
    async hasActivity(userId) {
      const traces = [
        sql`select * from asignaciones_paralelo where asignacion_rol_id in (select asignacion_rol_id from asignaciones_rol where usuario_id = ${userId}::uuid)`,
        sql`select * from revisiones_silabo where enviado_por = ${userId}::uuid`,
        sql`select * from exportaciones_silabo where solicitado_por = ${userId}::uuid`,
        sql`select * from archivos where subido_por = ${userId}::uuid`,
        sql`select * from firmas_silabo where usuario_id = ${userId}::uuid`,
      ]
      for (const trace of traces) if (await exists(trace)) return true
      return false
    },
    async purgeAccount(userId) {
      await executor.execute(sql`delete from notificaciones where usuario_id = ${userId}::uuid`)
      await executor.execute(sql`delete from sesiones where user_id = ${userId}::uuid`)
      await executor.execute(sql`delete from asignaciones_rol where usuario_id = ${userId}::uuid`)
      await executor.execute(sql`delete from usuarios where usuario_id = ${userId}::uuid`)
    },
    async careerLocked(careerId) {
      return exists(sql`select * from convocatorias_carreras where carrera_id = ${careerId}::uuid and estado_convocatoria_carrera = 'abierta'
        and exists (select * from convocatorias_universidad where convocatorias_carreras.convocatoria_universidad_id = convocatorias_universidad.convocatoria_universidad_id
          and estado_convocatoria_universidad in ('abierto', 'pausado'))`)
    },
  }
  return tx
}

export function accountRepositoryOn(executor: AccountExecutor, transaction: <T>(work: (tx: AccountTx) => Promise<T>) => Promise<T>): AccountRepository {
  const rows = async (query: SQL) => (await executor.execute(query)).rows as Row[]
  return {
    async findAccount(id) {
      return toAccount((await rows(sql`select ${ACCOUNT_COLUMNS} from usuarios where usuario_id = ${id}::uuid limit 1`))[0])
    },
    async findGrant(id) {
      return toGrant((await rows(sql`select ${GRANT_COLUMNS} from asignaciones_rol where asignacion_rol_id = ${id}::uuid limit 1`))[0])
    },
    async emailTaken(email, ignoreUserId) {
      const ignore = ignoreUserId === null ? sql`` : sql` and usuario_id <> ${ignoreUserId}::uuid`
      const [row] = await rows(sql`select count(*) as aggregate from usuarios where correo_electronico = ${email}${ignore}`)
      return Number(row?.aggregate ?? 0) > 0
    },
    async activeCareer(id) {
      const [row] = await rows(sql`select count(*) as aggregate from carreras where carrera_id = ${id}::uuid and carrera_activa = true`)
      return Number(row?.aggregate ?? 0) > 0
    },
    async hasEffectiveRole(userId, role, careerId) {
      const [row] = await rows(sql`select exists(select * from asignaciones_rol where usuario_id = ${userId}::uuid and asignacion_rol_activa = true
        and rol = ${role} and carrera_id = ${careerId}::uuid) as found`)
      return row?.found === true
    },
    direct: (work) => work(accountTx(executor)),
    transaction,
  }
}

export function createAccountRepository(): AccountRepository {
  return accountRepositoryOn(db as unknown as AccountExecutor, (work) => db.transaction((tx) => work(accountTx(tx as unknown as AccountExecutor))))
}
