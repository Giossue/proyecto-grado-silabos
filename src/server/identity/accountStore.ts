import "server-only"
import { notificationScope } from "../notifications/queries"
import { returnApprovals } from "../syllabus/coordinationHandover"
import { FinalizedChangeNotice } from "../syllabus/finalizedChangeNotice"
import { InProgressWork } from "../syllabus/inProgressWork"
import { and, countDistinct, desc, eq, exists, gt, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm"
import { db, type Executor } from "@/db"
import { fromEpoch, hasRows } from "@/db/expressions"
import {
  archivos,
  asignacionesParalelo,
  asignacionesRol,
  carreras,
  convocatoriasCarreras,
  convocatoriasUniversidad,
  docentesVigentesSilabo,
  exportacionesSilabo,
  firmasSilabo,
  invitacionesActivacion,
  notificaciones,
  revisionesSilabo,
  sesiones,
  silabos,
  usuarios,
} from "@/db/schema"
import { careerLabelSql } from "../academic/careerLabel"
import { uuid7 } from "../http/uuid7"
import type { AccountRepository, AccountTx } from "./accounts"

const ACCOUNT = {
  id: usuarios.usuarioId,
  name: usuarios.nombreUsuario,
  email: usuarios.correoElectronico,
  active: usuarios.usuarioActivo,
  verified: isNotNull(usuarios.correoVerificadoEn).mapWith(Boolean),
}

const GRANT = {
  id: asignacionesRol.asignacionRolId,
  userId: asignacionesRol.usuarioId,
  role: asignacionesRol.rol,
  careerId: asignacionesRol.carreraId,
  active: asignacionesRol.asignacionRolActiva,
}

const ACTIVE_GRANT = eq(asignacionesRol.asignacionRolActiva, true)
const careerMatch = (careerId: string | null) => (careerId === null ? isNull(asignacionesRol.carreraId) : eq(asignacionesRol.carreraId, careerId))
const careerLabel = sql<string>`${careerLabelSql("carreras")}`
const PENDING_INVITATION = and(isNull(invitacionesActivacion.usadaEn), isNull(invitacionesActivacion.invalidadaEn))

async function first<T>(query: PromiseLike<T[]>): Promise<T | null> {
  return (await query)[0] ?? null
}

async function careerLabelOf(executor: Executor, careerId: string): Promise<string | null> {
  const row = await first(executor.select({ label: careerLabel }).from(carreras).where(eq(carreras.carreraId, careerId)))
  return row ? String(row.label) : null
}

export function accountTx(executor: Executor): AccountTx {
  const accounts = () => executor.select(ACCOUNT).from(usuarios)
  const grants = () => executor.select(GRANT).from(asignacionesRol)
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
    lockAccount: (id) => first(accounts().where(eq(usuarios.usuarioId, id)).limit(1).for("update")),
    lockAccountByEmail: (email) => first(accounts().where(sql`lower(${usuarios.correoElectronico}) = ${email}`).limit(1).for("update")),
    async insertAccount(account) {
      const id = uuid7()
      await executor.insert(usuarios).values({
        usuarioId: id,
        nombreUsuario: account.name,
        correoElectronico: account.email,
        contrasena: account.passwordHash,
        usuarioActivo: true,
        correoVerificadoEn: null,
      })
      return { id, name: account.name, email: account.email, active: true, verified: false }
    },
    async updateIdentity(id, name, email) {
      await executor.update(usuarios).set({ nombreUsuario: name, correoElectronico: email }).where(eq(usuarios.usuarioId, id))
    },
    async setActive(id, active) {
      await executor.update(usuarios).set({ usuarioActivo: active }).where(eq(usuarios.usuarioId, id))
    },
    async setRememberToken(id, token) {
      await executor.update(usuarios).set({ codigoRecordarme: token }).where(eq(usuarios.usuarioId, id))
    },
    async lockFormation(id) {
      const row = await first(
        executor.select({ formation: usuarios.formacionExperienciaUsuario }).from(usuarios).where(eq(usuarios.usuarioId, id)).limit(1).for("update"),
      )
      return row ? { formation: row.formation ?? null } : null
    },
    async setFormation(id, formation) {
      await executor.update(usuarios).set({ formacionExperienciaUsuario: formation }).where(eq(usuarios.usuarioId, id))
    },
    async setAccessibility(id, preferences) {
      await executor.update(usuarios).set({ preferenciasAccesibilidadUsuario: preferences }).where(eq(usuarios.usuarioId, id))
    },
    async effectiveRoles(userId) {
      const found = await executor.select({ role: asignacionesRol.rol }).from(asignacionesRol).where(and(eq(asignacionesRol.usuarioId, userId), ACTIVE_GRANT))
      return found.map((row) => row.role)
    },
    lockEffectiveGrants: (userId) => grants().where(and(eq(asignacionesRol.usuarioId, userId), ACTIVE_GRANT)).for("update"),
    async lockCurrentCoordinator(careerId, exceptUserId) {
      const row = await first(
        executor
          .select({ grantId: asignacionesRol.asignacionRolId, userId: asignacionesRol.usuarioId, userName: usuarios.nombreUsuario })
          .from(asignacionesRol)
          .innerJoin(usuarios, and(eq(usuarios.usuarioId, asignacionesRol.usuarioId), eq(usuarios.usuarioActivo, true)))
          .where(and(ACTIVE_GRANT, careerMatch(careerId), ne(asignacionesRol.usuarioId, exceptUserId), eq(asignacionesRol.rol, "coordinador")))
          .limit(1)
          .for("update", { of: asignacionesRol }),
      )
      return row
    },
    async guardHandover(careerId, confirmed, afterCommit, now) {
      const work = new InProgressWork(executor, afterCommit, notificationScope(executor, afterCommit, now))
      await new FinalizedChangeNotice(work, now).guardHandover(confirmed, careerId)
    },
    async returnApprovals(careerId, afterCommit, now) {
      const work = new InProgressWork(executor, afterCommit, notificationScope(executor, afterCommit, now))
      return returnApprovals(executor, afterCommit, careerId, (where) => work.syllabi(where, { lock: true }))
    },
    findGrant: (userId, role, careerId, activeFirst) => {
      const query = grants().where(and(eq(asignacionesRol.usuarioId, userId), eq(asignacionesRol.rol, role), careerMatch(careerId)))
      return first((activeFirst ? query.orderBy(desc(asignacionesRol.asignacionRolActiva)) : query).limit(1))
    },
    lockActiveGrant: (userId, role, careerId) =>
      first(
        grants()
          .where(and(eq(asignacionesRol.usuarioId, userId), eq(asignacionesRol.rol, role), eq(asignacionesRol.carreraId, careerId), ACTIVE_GRANT))
          .limit(1)
          .for("update"),
      ),
    async insertGrant(userId, role, careerId, at) {
      const id = uuid7()
      await executor
        .insert(asignacionesRol)
        .values({ asignacionRolId: id, usuarioId: userId, rol: role, carreraId: careerId, asignacionRolActiva: true, asignadoEn: fromEpoch(at) })
      return { id, userId, role, careerId, active: true }
    },
    async setGrantActive(id, active) {
      await executor.update(asignacionesRol).set({ asignacionRolActiva: active }).where(eq(asignacionesRol.asignacionRolId, id))
    },
    async invitationRole(userId) {
      const row = await first(
        executor
          .select({ role: asignacionesRol.rol, careerId: asignacionesRol.carreraId })
          .from(asignacionesRol)
          .where(and(eq(asignacionesRol.usuarioId, userId), ACTIVE_GRANT))
          .limit(1),
      )
      if (!row) return null
      if (row.careerId === null) return { role: row.role, careerLabel: null }
      return { role: row.role, careerLabel: await careerLabelOf(executor, row.careerId) }
    },
    async lockActiveParallelAssignments(grantId) {
      const found = await executor
        .select({ id: asignacionesParalelo.asignacionParaleloId })
        .from(asignacionesParalelo)
        .where(and(eq(asignacionesParalelo.asignacionRolId, grantId), eq(asignacionesParalelo.asignacionParaleloActiva, true)))
        .for("update")
      return found.map((row) => row.id)
    },
    async deleteParallelAssignment(id) {
      await executor.delete(asignacionesParalelo).where(eq(asignacionesParalelo.asignacionParaleloId, id))
    },
    async closeParallelAssignments(userId) {
      const result = await executor
        .update(asignacionesParalelo)
        .set({ asignacionParaleloActiva: false })
        .where(and(inArray(asignacionesParalelo.asignacionRolId, grantsOf(executor, userId)), eq(asignacionesParalelo.asignacionParaleloActiva, true)))
      return result.rowCount ?? 0
    },
    async lockEffectiveCoordinations(userId) {
      const found = await executor
        .select({ id: asignacionesRol.asignacionRolId, careerId: asignacionesRol.carreraId, label: careerLabel })
        .from(asignacionesRol)
        .leftJoin(carreras, eq(carreras.carreraId, asignacionesRol.carreraId))
        .where(and(ACTIVE_GRANT, eq(asignacionesRol.usuarioId, userId), eq(asignacionesRol.rol, "coordinador")))
        .for("update", { of: asignacionesRol })
      return found.map((row) => ({ id: row.id, label: String(row.label ?? row.careerId ?? "") }))
    },
    isEffectiveAdministrator: (userId) =>
      hasRows(
        executor
          .select({ id: asignacionesRol.asignacionRolId })
          .from(asignacionesRol)
          .where(and(ACTIVE_GRANT, eq(asignacionesRol.usuarioId, userId), eq(asignacionesRol.rol, "administrador")))
          .limit(1),
      ),
    otherActiveAdministratorExists: (userId) =>
      hasRows(
        executor
          .select({ id: asignacionesRol.asignacionRolId })
          .from(asignacionesRol)
          .where(
            and(
              ACTIVE_GRANT,
              ne(asignacionesRol.usuarioId, userId),
              eq(asignacionesRol.rol, "administrador"),
              exists(executor.select({ id: usuarios.usuarioId }).from(usuarios).where(and(eq(asignacionesRol.usuarioId, usuarios.usuarioId), eq(usuarios.usuarioActivo, true)))),
            ),
          )
          .limit(1),
      ),
    async syllabiInProgress(userId) {
      const found = await executor
        .select({ careerId: carreras.carreraId, total: countDistinct(silabos.silaboId) })
        .from(docentesVigentesSilabo)
        .innerJoin(silabos, eq(silabos.silaboId, docentesVigentesSilabo.silaboId))
        .innerJoin(convocatoriasCarreras, eq(convocatoriasCarreras.convocatoriaCarreraId, silabos.convocatoriaCarreraId))
        .innerJoin(carreras, eq(carreras.carreraId, convocatoriasCarreras.carreraId))
        .where(
          and(
            eq(docentesVigentesSilabo.usuarioId, userId),
            inArray(silabos.estadoSilabo, ["borrador", "en_revision", "correccion_solicitada"]),
            eq(convocatoriasCarreras.estadoConvocatoriaCarrera, "abierta"),
          ),
        )
        .groupBy(carreras.carreraId)
      const result: { careerLabel: string; total: number }[] = []
      for (const row of found) result.push({ careerLabel: (await careerLabelOf(executor, row.careerId)) ?? "", total: row.total })
      return result
    },
    hasActiveInvitation: (userId, now) =>
      hasRows(
        executor
          .select({ id: invitacionesActivacion.invitacionActivacionId })
          .from(invitacionesActivacion)
          .where(and(eq(invitacionesActivacion.usuarioId, userId), PENDING_INVITATION, gt(invitacionesActivacion.expiraEn, fromEpoch(now))))
          .limit(1),
      ),
    async invalidateInvitations(userId, now) {
      await executor
        .update(invitacionesActivacion)
        .set({ invalidadaEn: fromEpoch(now) })
        .where(and(eq(invitacionesActivacion.usuarioId, userId), PENDING_INVITATION))
    },
    async insertInvitation(invitation) {
      await executor.insert(invitacionesActivacion).values({
        invitacionActivacionId: uuid7(),
        usuarioId: invitation.userId,
        hashActivacion: invitation.hash,
        expiraEn: fromEpoch(invitation.expiresAt),
        emitidaPorUsuarioId: invitation.issuerId,
        creadaEn: fromEpoch(invitation.createdAt),
      })
    },
    async latestInvitationIssuer(userId) {
      const row = await first(
        executor
          .select({ issuerId: invitacionesActivacion.emitidaPorUsuarioId })
          .from(invitacionesActivacion)
          .where(eq(invitacionesActivacion.usuarioId, userId))
          .orderBy(desc(invitacionesActivacion.creadaEn))
          .limit(1),
      )
      if (!row || row.issuerId === null) return null
      return first(accounts().where(eq(usuarios.usuarioId, row.issuerId)).limit(1))
    },
    async deleteSessions(userId, exceptId) {
      const result = await executor.delete(sesiones).where(and(eq(sesiones.userId, userId), exceptId === null ? undefined : ne(sesiones.id, exceptId)))
      return result.rowCount ?? 0
    },
    async deleteSession(id, userId) {
      await executor.delete(sesiones).where(and(eq(sesiones.id, id), eq(sesiones.userId, userId)))
    },
    async hasActivity(userId) {
      const traces = [
        () => executor.select({ id: asignacionesParalelo.asignacionParaleloId }).from(asignacionesParalelo).where(inArray(asignacionesParalelo.asignacionRolId, grantsOf(executor, userId))),
        () => executor.select({ id: revisionesSilabo.revisionSilaboId }).from(revisionesSilabo).where(eq(revisionesSilabo.enviadoPor, userId)),
        () => executor.select({ id: exportacionesSilabo.exportacionSilaboId }).from(exportacionesSilabo).where(eq(exportacionesSilabo.solicitadoPor, userId)),
        () => executor.select({ id: archivos.archivoId }).from(archivos).where(eq(archivos.subidoPor, userId)),
        () => executor.select({ id: firmasSilabo.firmaSilaboId }).from(firmasSilabo).where(eq(firmasSilabo.usuarioId, userId)),
      ]
      for (const trace of traces) if (await hasRows(trace().limit(1))) return true
      return false
    },
    async purgeAccount(userId) {
      await executor.delete(notificaciones).where(eq(notificaciones.usuarioId, userId))
      await executor.delete(sesiones).where(eq(sesiones.userId, userId))
      await executor.delete(asignacionesRol).where(eq(asignacionesRol.usuarioId, userId))
      await executor.delete(usuarios).where(eq(usuarios.usuarioId, userId))
    },
    careerLocked: (careerId) =>
      hasRows(
        executor
          .select({ id: convocatoriasCarreras.convocatoriaCarreraId })
          .from(convocatoriasCarreras)
          .where(
            and(
              eq(convocatoriasCarreras.carreraId, careerId),
              eq(convocatoriasCarreras.estadoConvocatoriaCarrera, "abierta"),
              exists(
                executor
                  .select({ id: convocatoriasUniversidad.convocatoriaUniversidadId })
                  .from(convocatoriasUniversidad)
                  .where(
                    and(
                      eq(convocatoriasCarreras.convocatoriaUniversidadId, convocatoriasUniversidad.convocatoriaUniversidadId),
                      inArray(convocatoriasUniversidad.estadoConvocatoriaUniversidad, ["abierto", "pausado"]),
                    ),
                  ),
              ),
            ),
          )
          .limit(1),
      ),
  }
  return tx
}

function grantsOf(executor: Executor, userId: string) {
  return executor.select({ id: asignacionesRol.asignacionRolId }).from(asignacionesRol).where(eq(asignacionesRol.usuarioId, userId))
}

export function accountRepositoryOn(executor: Executor, transaction: <T>(work: (tx: AccountTx) => Promise<T>) => Promise<T>): AccountRepository {
  return {
    findAccount: (id) => first(executor.select(ACCOUNT).from(usuarios).where(eq(usuarios.usuarioId, id)).limit(1)),
    findGrant: (id) => first(executor.select(GRANT).from(asignacionesRol).where(eq(asignacionesRol.asignacionRolId, id)).limit(1)),
    async emailTaken(email, ignoreUserId) {
      const total = await executor.$count(usuarios, and(eq(usuarios.correoElectronico, email), ignoreUserId === null ? undefined : ne(usuarios.usuarioId, ignoreUserId)))
      return total > 0
    },
    async activeCareer(id) {
      return (await executor.$count(carreras, and(eq(carreras.carreraId, id), eq(carreras.carreraActiva, true)))) > 0
    },
    hasEffectiveRole: (userId, role, careerId) =>
      hasRows(
        executor
          .select({ id: asignacionesRol.asignacionRolId })
          .from(asignacionesRol)
          .where(and(eq(asignacionesRol.usuarioId, userId), ACTIVE_GRANT, eq(asignacionesRol.rol, role), eq(asignacionesRol.carreraId, careerId)))
          .limit(1),
      ),
    direct: (work) => work(accountTx(executor)),
    transaction,
  }
}

export function createAccountRepository(): AccountRepository {
  return accountRepositoryOn(db, (work) => db.transaction((tx) => work(accountTx(tx))))
}
