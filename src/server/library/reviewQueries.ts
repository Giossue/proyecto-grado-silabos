import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import { accentMatches, iso8601 } from "../laravel/sql"
import type { LibraryReviewRepository, ReviewFilters, ReviewRow, SyllabusSummary } from "./reviews"

const OUTCOME_SQL = sql.raw(`CASE
            WHEN envios_biblioteca.verificado_en IS NOT NULL THEN 'firmado'
            WHEN revision.correccion_etapa = 'biblioteca' THEN 'devuelto'
            WHEN EXISTS (
                SELECT 1 FROM revisiones_silabo posterior
                WHERE posterior.silabo_id = revision.silabo_id AND posterior.numero_revision > revision.numero_revision
            ) THEN 'reemplazado'
            ELSE 'pendiente'
        END`)

const RESPONSIBLE_SQL = sql.raw(`COALESCE(
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

const STATE_SQL = sql`CASE (${OUTCOME_SQL}) WHEN 'pendiente' THEN 'pendiente' ELSE 'atendido' END`
async function rows<T>(query: SQL): Promise<T[]> {
  return (await db.execute(query)).rows as T[]
}

const matches = accentMatches

async function currentProcessId(): Promise<string | null> {
  const [row] = await rows<{ id: string }>(sql`select convocatoria_universidad_id::text as id from convocatorias_universidad
    order by fecha_inicio desc, convocatoria_universidad_id desc limit 1`)
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

const FROM = sql`from envios_biblioteca
  inner join revisiones_silabo as revision on revision.revision_silabo_id = envios_biblioteca.revision_silabo_id
  inner join silabos as silabo on silabo.silabo_id = revision.silabo_id`

type PageRow = {
  revision_id: string
  silabo_id: string
  numero_revision: number
  enviado_por: string
  verificado_por: string | null
  enviado_en: string
  estado_envio: string
  resultado_envio: string | null
  responsable_id: string | null
}

export function createLibraryReviewRepository(): LibraryReviewRepository {
  const names = async (ids: string[]): Promise<Map<string, string>> => {
    if (ids.length === 0) return new Map()
    const found = await rows<{ id: string; name: string }>(
      sql`select usuario_id::text as id, nombre_usuario as name from usuarios where usuario_id in (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    )
    return new Map(found.map((row) => [row.id, row.name]))
  }
  return {
    async page(filters, page, perPage) {
      const where = sql.join(conditions(filters, await currentProcessId()), sql` and `)
      const [{ total }] = await rows<{ total: string }>(sql`select count(*) as total ${FROM} where ${where}`)
      if (Number(total) === 0) return { total: 0, items: [] }
      const found = await rows<PageRow>(sql`select envios_biblioteca.*, revision.revision_silabo_id::text as revision_id,
          revision.silabo_id::text as silabo_id, revision.numero_revision as numero_revision,
          revision.enviado_por::text as enviado_por, ${iso8601(sql.raw("revision.enviado_en"))} as enviado_en,
          ${STATE_SQL} AS estado_envio, ${OUTCOME_SQL} AS resultado_envio, (${RESPONSIBLE_SQL})::text AS responsable_id
        ${FROM}
        where ${where}
        order by revision.enviado_en desc
        limit ${perPage} offset ${(page - 1) * perPage}`)
      const people = await names([...new Set(found.flatMap((row) => [row.enviado_por, ...(row.verificado_por ? [String(row.verificado_por)] : [])]))])
      return {
        total: Number(total),
        items: found.map(
          (row): ReviewRow => ({
            revisionId: row.revision_id,
            syllabusId: row.silabo_id,
            revisionNumber: Number(row.numero_revision),
            sentAt: row.enviado_en,
            sentBy: people.get(row.enviado_por) ?? "",
            signedBy: row.verificado_por ? (people.get(String(row.verificado_por)) ?? null) : null,
            responsibleId: row.responsable_id,
            state: row.estado_envio,
            outcome: row.resultado_envio,
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
      const teachers = await rows<{ silabo_id: string; nombre_usuario: string }>(sql`select usuarios.usuario_id, usuarios.nombre_usuario,
          docentes_vigentes_silabo.silabo_id::text as silabo_id
        from usuarios inner join docentes_vigentes_silabo on usuarios.usuario_id = docentes_vigentes_silabo.usuario_id
        where docentes_vigentes_silabo.silabo_id in (${list})`)
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
    async faculties() {
      return rows<{ id: string; name: string }>(sql`select facultad_id::text as id, nombre_facultad as name from facultades
        where facultad_activa = true order by nombre_facultad asc`)
    },
    async pastPeriods() {
      const current = await currentProcessId()
      const others = current === null ? sql`convocatoria_universidad_id is not null` : sql`convocatoria_universidad_id != ${current}`
      return rows<{ id: string; code: string }>(sql`select periodo_academico_id::text as id, codigo_periodo_academico as code
        from periodos_academicos
        where periodo_academico_id in (select periodo_academico_id from convocatorias_universidad where ${others})
        order by fecha_fin_periodo desc`)
    },
    async existing(table, ids) {
      const list = sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )
      const column = table === "facultades" ? sql.raw("facultad_id") : sql.raw("periodo_academico_id")
      const [{ total }] = await rows<{ total: string }>(sql`select count(*) as total from ${sql.raw(table)} where ${column} in (${list})`)
      return Number(total)
    },
  }
}

export async function libraryReviewCounts(): Promise<Record<string, number>> {
  const filters: ReviewFilters = { state: null, search: null, facultyId: null, period: "actual", periodId: null, handledBy: null }
  const where = sql.join(conditions(filters, await currentProcessId()), sql` and `)
  const totals = await rows<{ outcome: string | null; total: string }>(sql`select resultado_envio as outcome, count(*) as total
    from (select ${OUTCOME_SQL} as resultado_envio ${FROM} where ${where}) as envios group by resultado_envio`)
  const counts: Record<string, number> = { pendiente: 0, firmado: 0, devuelto: 0, reemplazado: 0 }
  for (const { outcome, total } of totals) if (outcome !== null && outcome in counts) counts[outcome] = Number(total)
  return counts
}
