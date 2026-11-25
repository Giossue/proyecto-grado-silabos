import { and, asc, count, desc, eq, inArray, isNotNull, ne, sql, type SQL } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { db } from "@/db"
import { isoText } from "@/db/expressions"
import {
  convocatoriasUniversidad,
  docentesVigentesSilabo,
  enviosBiblioteca,
  facultades,
  periodosAcademicos,
  revisionesSilabo,
  silabos,
  usuarios,
} from "@/db/schema"
import { libraryStatusLabel } from "@silabos/shared/lib/libraryStates"
import type { LibrarySort, ListSort } from "@silabos/shared/schemas/listSort"
import { accentMatches } from "../http/sql"
import type { LibraryReviewRepository, ReviewFilters, ReviewRow, SyllabusSummary } from "./reviews"

export const OUTCOME_SQL = sql.raw(`CASE
            WHEN envios_biblioteca.verificado_en IS NOT NULL THEN 'firmado'
            WHEN revision.correccion_etapa = 'biblioteca' THEN 'devuelto'
            WHEN EXISTS (
                SELECT 1 FROM revisiones_silabo posterior
                WHERE posterior.silabo_id = revision.silabo_id AND posterior.numero_revision > revision.numero_revision
            ) THEN 'reemplazado'
            ELSE 'pendiente'
        END`)

export const RESPONSIBLE_SQL = sql.raw(`COALESCE(
            envios_biblioteca.verificado_por,
            CASE WHEN revision.correccion_etapa = 'biblioteca' THEN revision.correccion_solicitada_por END,
            (
                SELECT COALESCE(envio_anterior.verificado_por, anterior.correccion_solicitada_por) FROM revisiones_silabo anterior
                LEFT JOIN envios_biblioteca envio_anterior ON envio_anterior.revision_silabo_id = anterior.revision_silabo_id
                WHERE anterior.silabo_id = revision.silabo_id AND anterior.numero_revision < revision.numero_revision
                  AND (envio_anterior.verificado_por IS NOT NULL OR anterior.correccion_etapa = 'biblioteca')
                ORDER BY anterior.numero_revision DESC LIMIT 1
            )
        )`)

export const STATE_SQL = sql`CASE (${OUTCOME_SQL}) WHEN 'pendiente' THEN 'pendiente' ELSE 'atendido' END`
async function rows<T>(query: SQL): Promise<T[]> {
  return (await db.execute(query)).rows as T[]
}

const matches = accentMatches
const revision = alias(revisionesSilabo, "revision")
const silabo = alias(silabos, "silabo")
const REVISION_JOIN = eq(revision.revisionSilaboId, enviosBiblioteca.revisionSilaboId)
const SYLLABUS_JOIN = eq(silabo.silaboId, revision.silaboId)

const CONVOCATION_OF = (column: string): SQL => sql`(select ${sql.raw(column)} from convocatorias_carreras as convocatoria_orden
  inner join carreras as carrera_orden on carrera_orden.carrera_id = convocatoria_orden.carrera_id
  left join facultades as facultad_orden on facultad_orden.facultad_id = carrera_orden.facultad_id
  inner join convocatorias_universidad as proceso_orden on proceso_orden.convocatoria_universidad_id = convocatoria_orden.convocatoria_universidad_id
  inner join periodos_academicos as periodo_orden on periodo_orden.periodo_academico_id = proceso_orden.periodo_academico_id
  where convocatoria_orden.convocatoria_carrera_id = silabo.convocatoria_carrera_id)`

const USER_NAME = (id: SQL): SQL => sql`(select usuario_orden.nombre_usuario from usuarios as usuario_orden where usuario_orden.usuario_id = ${id})`

const SORT_KEYS: Record<LibrarySort, SQL> = {
  faculty: CONVOCATION_OF("facultad_orden.nombre_facultad"),
  career: CONVOCATION_OF("carrera_orden.nombre_carrera"),
  subject: sql`(select case when jsonb_typeof(silabo.datos_academicos_silabo #> '{subject,name}') = 'string'
      then silabo.datos_academicos_silabo #>> '{subject,name}' else asignatura_orden.nombre_asignatura end
    from paralelos as paralelo_orden inner join asignaturas as asignatura_orden on asignatura_orden.asignatura_id = paralelo_orden.asignatura_id
    where paralelo_orden.paralelo_id = silabo.paralelo_id)`,
  responsible: USER_NAME(sql`(${RESPONSIBLE_SQL})`),
  state: sql`case (${OUTCOME_SQL}) ${sql.join(
    ["pendiente", "firmado", "devuelto", "reemplazado"].map((status) => sql`when ${status} then ${libraryStatusLabel(status)}::text`),
    sql` `,
  )} end`,
  period: CONVOCATION_OF("periodo_orden.fecha_fin_periodo"),
  teacher: sql`(select min(usuario_docente.nombre_usuario) from docentes_vigentes_silabo as docente_orden
    inner join usuarios as usuario_docente on usuario_docente.usuario_id = docente_orden.usuario_id
    where docente_orden.silabo_id = silabo.silabo_id)`,
  signed: USER_NAME(sql`envios_biblioteca.verificado_por`),
}

export function libraryOrder(sort: ListSort<LibrarySort>): SQL[] {
  if (sort === null) return [desc(revision.enviadoEn)]
  return [sql`${SORT_KEYS[sort.column]} ${sql.raw(sort.direction)} nulls last`, desc(revision.enviadoEn), asc(enviosBiblioteca.envioBibliotecaId)]
}

async function currentProcessId(): Promise<string | null> {
  const [row] = await db
    .select({ id: convocatoriasUniversidad.convocatoriaUniversidadId })
    .from(convocatoriasUniversidad)
    .orderBy(desc(convocatoriasUniversidad.fechaInicio), desc(convocatoriasUniversidad.convocatoriaUniversidadId))
    .limit(1)
  return row?.id ?? null
}

function conditions(filters: ReviewFilters, current: string | null): SQL[] {
  const where: SQL[] = [
    sql`envios_biblioteca.verificacion_heredada = false`,
    sql`not exists (select 1 from revisiones_silabo as posterior
      inner join envios_biblioteca as envio_posterior on envio_posterior.revision_silabo_id = posterior.revision_silabo_id
      where envio_posterior.verificacion_heredada = false and posterior.silabo_id = revision.silabo_id
        and posterior.numero_revision > revision.numero_revision)`,
  ]
  if (filters.state !== null) {
    where.push(["firmado", "devuelto", "reemplazado"].includes(filters.state) ? sql`(${OUTCOME_SQL}) = ${filters.state}` : sql`(${STATE_SQL}) = ${filters.state}`)
  }
  if (filters.search !== null && filters.search !== "") {
    const term = filters.search
    where.push(sql`(${matches(sql.raw(`silabo.datos_academicos_silabo->'subject'->>'name'`), term)}
      or ${matches(sql.raw(`silabo.datos_academicos_silabo->'subject'->>'code'`), term)}
      or exists (select 1 from convocatorias_carreras as convocatoria_busqueda
        inner join carreras as carrera_busqueda on carrera_busqueda.carrera_id = convocatoria_busqueda.carrera_id
        where convocatoria_busqueda.convocatoria_carrera_id = silabo.convocatoria_carrera_id
          and ${matches(sql.raw("carrera_busqueda.nombre_carrera"), term)})
      or exists (select 1 from docentes_vigentes_silabo as docente_busqueda
        inner join usuarios as usuario_busqueda on usuario_busqueda.usuario_id = docente_busqueda.usuario_id
        where docente_busqueda.silabo_id = silabo.silabo_id
          and ${matches(sql.raw("usuario_busqueda.nombre_usuario"), term)}))`)
  }
  if (filters.facultyId !== null) {
    where.push(sql`exists (select 1 from convocatorias_carreras as convocatoria
      inner join carreras as carrera on carrera.carrera_id = convocatoria.carrera_id
      where convocatoria.convocatoria_carrera_id = silabo.convocatoria_carrera_id and carrera.facultad_id = ${filters.facultyId})`)
  }
  const process =
    filters.period === "actual"
      ? current === null
        ? sql` and proceso.convocatoria_universidad_id is null`
        : sql` and proceso.convocatoria_universidad_id = ${current}`
      : current === null
        ? sql` and proceso.convocatoria_universidad_id is not null`
        : sql` and proceso.convocatoria_universidad_id != ${current}`
  const period = filters.periodId === null ? sql`` : sql` and periodo.periodo_academico_id = ${filters.periodId}`
  where.push(sql`exists (select 1 from convocatorias_carreras as convocatoria
    inner join convocatorias_universidad as proceso on proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id
    inner join periodos_academicos as periodo on periodo.periodo_academico_id = proceso.periodo_academico_id
    where convocatoria.convocatoria_carrera_id = silabo.convocatoria_carrera_id${process}${period})`)
  if (filters.handledBy !== null) {
    where.push(sql`(envios_biblioteca.verificado_por = ${filters.handledBy}
      or (revision.correccion_etapa = 'biblioteca' and revision.correccion_solicitada_por = ${filters.handledBy}))`)
  }
  return where
}

export const LIBRARY_FROM = sql`from envios_biblioteca
  inner join revisiones_silabo as revision on revision.revision_silabo_id = envios_biblioteca.revision_silabo_id
  inner join silabos as silabo on silabo.silabo_id = revision.silabo_id`

export function createLibraryReviewRepository(): LibraryReviewRepository {
  const names = async (ids: string[]): Promise<Map<string, string>> => {
    if (ids.length === 0) return new Map()
    const found = await db.select({ id: usuarios.usuarioId, name: usuarios.nombreUsuario }).from(usuarios).where(inArray(usuarios.usuarioId, ids))
    return new Map(found.map((row) => [row.id, row.name]))
  }
  return {
    async page(filters, page, perPage, sort = null) {
      const where = and(...conditions(filters, await currentProcessId()))
      const [{ total }] = await db
        .select({ total: count() })
        .from(enviosBiblioteca)
        .innerJoin(revision, REVISION_JOIN)
        .innerJoin(silabo, SYLLABUS_JOIN)
        .where(where)
      if (total === 0) return { total: 0, items: [] }
      const found = await db
        .select({
          revisionId: revision.revisionSilaboId,
          syllabusId: revision.silaboId,
          revisionNumber: revision.numeroRevision,
          sentBy: revision.enviadoPor,
          signedBy: enviosBiblioteca.verificadoPor,
          sentAt: isoText(revision.enviadoEn),
          state: sql<string>`${STATE_SQL}`,
          outcome: sql<string | null>`${OUTCOME_SQL}`,
          responsibleId: sql<string | null>`(${RESPONSIBLE_SQL})::text`,
        })
        .from(enviosBiblioteca)
        .innerJoin(revision, REVISION_JOIN)
        .innerJoin(silabo, SYLLABUS_JOIN)
        .where(where)
        .orderBy(...libraryOrder(sort))
        .limit(perPage)
        .offset((page - 1) * perPage)
      const people = await names([...new Set(found.flatMap((row) => [row.sentBy, ...(row.signedBy ? [row.signedBy] : [])]))])
      return {
        total,
        items: found.map(
          (row): ReviewRow => ({
            revisionId: row.revisionId,
            syllabusId: row.syllabusId,
            revisionNumber: Number(row.revisionNumber),
            sentAt: row.sentAt,
            sentBy: people.get(row.sentBy) ?? "",
            signedBy: row.signedBy ? (people.get(row.signedBy) ?? null) : null,
            responsibleId: row.responsibleId,
            state: row.state,
            outcome: row.outcome,
          }),
        ),
      }
    },
    async summaries(ids) {
      if (ids.length === 0) return new Map()
      const list = sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )
      const found = await rows<{
        id: string
        subject: string
        code: string
        parallel: string
        faculty: string | null
        career: string
        period: string
      }>(sql`select s.silabo_id::text as id,
          case when jsonb_typeof(s.datos_academicos_silabo #> '{subject,name}') = 'string'
            then s.datos_academicos_silabo #>> '{subject,name}' else a.nombre_asignatura end as subject,
          case when jsonb_typeof(s.datos_academicos_silabo #> '{subject,code}') = 'string'
            then s.datos_academicos_silabo #>> '{subject,code}' else a.codigo_asignatura end as code,
          case when jsonb_typeof(s.datos_academicos_silabo #> '{parallel,code}') = 'string'
            then s.datos_academicos_silabo #>> '{parallel,code}' else p.codigo_paralelo end as parallel,
          f.nombre_facultad as faculty,
          case when (select count(*) from carreras same where same.nombre_carrera = c.nombre_carrera) > 1
            then c.nombre_carrera || ' · ' || c.codigo_carrera else c.nombre_carrera end as career,
          pa.codigo_periodo_academico as period
        from silabos s
        inner join paralelos p on p.paralelo_id = s.paralelo_id
        inner join asignaturas a on a.asignatura_id = p.asignatura_id
        inner join convocatorias_carreras cc on cc.convocatoria_carrera_id = s.convocatoria_carrera_id
        inner join carreras c on c.carrera_id = cc.carrera_id
        left join facultades f on f.facultad_id = c.facultad_id
        inner join convocatorias_universidad cu on cu.convocatoria_universidad_id = cc.convocatoria_universidad_id
        inner join periodos_academicos pa on pa.periodo_academico_id = cu.periodo_academico_id
        where s.silabo_id in (${list})`)
      const teachers = await db
        .select({ silabo_id: docentesVigentesSilabo.silaboId, nombre_usuario: usuarios.nombreUsuario })
        .from(usuarios)
        .innerJoin(docentesVigentesSilabo, eq(usuarios.usuarioId, docentesVigentesSilabo.usuarioId))
        .where(inArray(docentesVigentesSilabo.silaboId, ids))
      return new Map(
        found.map((row): [string, SyllabusSummary] => [
          row.id,
          {
            subject: row.subject,
            code: row.code,
            faculty: row.faculty,
            career: row.career,
            period: row.period,
            parallel: row.parallel,
            teachers: [...new Set(teachers.filter((teacher) => teacher.silabo_id === row.id).map((teacher) => teacher.nombre_usuario))],
          },
        ]),
      )
    },
    userNames: names,
    faculties: () =>
      db
        .select({ id: facultades.facultadId, name: facultades.nombreFacultad })
        .from(facultades)
        .where(eq(facultades.facultadActiva, true))
        .orderBy(asc(facultades.nombreFacultad)),
    async pastPeriods() {
      const current = await currentProcessId()
      const process = convocatoriasUniversidad.convocatoriaUniversidadId
      return db
        .select({ id: periodosAcademicos.periodoAcademicoId, code: periodosAcademicos.codigoPeriodoAcademico })
        .from(periodosAcademicos)
        .where(
          inArray(
            periodosAcademicos.periodoAcademicoId,
            db
              .select({ id: convocatoriasUniversidad.periodoAcademicoId })
              .from(convocatoriasUniversidad)
              .where(current === null ? isNotNull(process) : ne(process, current)),
          ),
        )
        .orderBy(desc(periodosAcademicos.fechaFinPeriodo))
    },
    existing: (table, ids) =>
      table === "facultades"
        ? db.$count(facultades, inArray(facultades.facultadId, ids))
        : db.$count(periodosAcademicos, inArray(periodosAcademicos.periodoAcademicoId, ids)),
  }
}

export async function libraryReviewCounts(): Promise<Record<string, number>> {
  const filters: ReviewFilters = { state: null, search: null, facultyId: null, period: "actual", periodId: null, handledBy: null }
  const where = sql.join(conditions(filters, await currentProcessId()), sql` and `)
  const totals = await rows<{ outcome: string | null; total: string }>(sql`select resultado_envio as outcome, count(*) as total
    from (select ${OUTCOME_SQL} as resultado_envio ${LIBRARY_FROM} where ${where}) as envios group by resultado_envio`)
  const counts: Record<string, number> = { pendiente: 0, firmado: 0, devuelto: 0, reemplazado: 0 }
  for (const { outcome, total } of totals) if (outcome !== null && outcome in counts) counts[outcome] = Number(total)
  return counts
}
