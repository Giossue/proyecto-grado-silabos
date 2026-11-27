import { libraryStatusLabel } from "@silabos/shared/lib/libraryStates"
import { SYLLABUS_STATE_LABELS } from "@silabos/shared/lib/syllabusStates"
import type { LibrarySort, ListSort } from "@silabos/shared/schemas/listSort"
import { Prisma } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"
import { accentMatches, isoText, uuidList } from "../../prisma/sql"
import type { LibraryReviewRepository, ReviewFilters, ReviewRow, SyllabusSummary } from "./reviews"

export const OUTCOME_SQL = Prisma.raw(`CASE
            WHEN envios_biblioteca.verificado_en IS NOT NULL THEN 'firmado'
            WHEN revision.correccion_etapa = 'biblioteca' THEN 'devuelto'
            WHEN EXISTS (
                SELECT 1 FROM revisiones_silabo posterior
                WHERE posterior.silabo_id = revision.silabo_id AND posterior.numero_revision > revision.numero_revision
            ) THEN 'reemplazado'
            ELSE 'pendiente'
        END`)

export const RESPONSIBLE_SQL = Prisma.raw(`COALESCE(
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

// A superseded delivery reads «Anterior»; any other one shows the state of its syllabus.
const SHOWN_STATE: Record<"firmado" | "devuelto" | "pendiente", string> = { pendiente: "en_revision", devuelto: "correccion_solicitada", firmado: "aprobado" }

export const STATE_SQL = Prisma.sql`CASE (${OUTCOME_SQL}) WHEN 'pendiente' THEN 'pendiente' ELSE 'atendido' END`

export const LIBRARY_FROM = Prisma.sql`from envios_biblioteca
  inner join revisiones_silabo as revision on revision.revision_silabo_id = envios_biblioteca.revision_silabo_id
  inner join silabos as silabo on silabo.silabo_id = revision.silabo_id`

const CONVOCATION_OF = (column: string): Prisma.Sql => Prisma.sql`(select ${Prisma.raw(column)} from convocatorias_carreras as convocatoria_orden
  inner join carreras as carrera_orden on carrera_orden.carrera_id = convocatoria_orden.carrera_id
  left join facultades as facultad_orden on facultad_orden.facultad_id = carrera_orden.facultad_id
  inner join convocatorias_universidad as proceso_orden on proceso_orden.convocatoria_universidad_id = convocatoria_orden.convocatoria_universidad_id
  inner join periodos_academicos as periodo_orden on periodo_orden.periodo_academico_id = proceso_orden.periodo_academico_id
  where convocatoria_orden.convocatoria_carrera_id = silabo.convocatoria_carrera_id)`

const USER_NAME = (id: Prisma.Sql): Prisma.Sql => Prisma.sql`(select usuario_orden.nombre_usuario from usuarios as usuario_orden where usuario_orden.usuario_id = ${id})`

const SORT_KEYS: Record<LibrarySort, Prisma.Sql> = {
  faculty: CONVOCATION_OF("facultad_orden.nombre_facultad"),
  career: CONVOCATION_OF("carrera_orden.nombre_carrera"),
  subject: Prisma.sql`(select case when jsonb_typeof(silabo.datos_academicos_silabo #> '{subject,name}') = 'string'
      then silabo.datos_academicos_silabo #>> '{subject,name}' else asignatura_orden.nombre_asignatura end
    from paralelos as paralelo_orden inner join asignaturas as asignatura_orden on asignatura_orden.asignatura_id = paralelo_orden.asignatura_id
    where paralelo_orden.paralelo_id = silabo.paralelo_id)`,
  responsible: USER_NAME(Prisma.sql`(${RESPONSIBLE_SQL})`),
  state: Prisma.sql`case when (${OUTCOME_SQL}) = 'reemplazado' then ${libraryStatusLabel("reemplazado")}::text else case silabo.estado_silabo ${Prisma.join(
    Object.keys(SYLLABUS_STATE_LABELS).map((status) => Prisma.sql`when ${status} then ${libraryStatusLabel(status)}::text`),
    " ",
  )} end end`,
  period: CONVOCATION_OF("periodo_orden.fecha_fin_periodo"),
  teacher: Prisma.sql`(select min(usuario_docente.nombre_usuario) from docentes_vigentes_silabo as docente_orden
    inner join usuarios as usuario_docente on usuario_docente.usuario_id = docente_orden.usuario_id
    where docente_orden.silabo_id = silabo.silabo_id)`,
  signed: USER_NAME(Prisma.sql`envios_biblioteca.verificado_por`),
}

export function libraryOrder(sort: ListSort<LibrarySort>): Prisma.Sql {
  if (sort === null) return Prisma.sql`revision.enviado_en desc`
  return Prisma.sql`${SORT_KEYS[sort.column]} ${Prisma.raw(sort.direction)} nulls last, revision.enviado_en desc, envios_biblioteca.envio_biblioteca_id asc`
}

async function currentProcessId(db: Db): Promise<string | null> {
  const [row] = await db.$queryRaw<{ id: string }[]>`select convocatoria_universidad_id::text as id from convocatorias_universidad
    order by fecha_inicio desc, convocatoria_universidad_id desc limit 1`
  return row?.id ?? null
}

function conditions(filters: ReviewFilters, current: string | null): Prisma.Sql {
  const where: Prisma.Sql[] = [
    Prisma.sql`envios_biblioteca.verificacion_heredada = false`,
    Prisma.sql`not exists (select 1 from revisiones_silabo as posterior
      inner join envios_biblioteca as envio_posterior on envio_posterior.revision_silabo_id = posterior.revision_silabo_id
      where envio_posterior.verificacion_heredada = false and posterior.silabo_id = revision.silabo_id
        and posterior.numero_revision > revision.numero_revision)`,
  ]
  if (filters.state !== null) {
    const shown = SHOWN_STATE[filters.state as keyof typeof SHOWN_STATE]
    if (shown !== undefined) where.push(Prisma.sql`silabo.estado_silabo = ${shown} and (${OUTCOME_SQL}) <> 'reemplazado'`)
    else if (filters.state === "reemplazado") where.push(Prisma.sql`(${OUTCOME_SQL}) = 'reemplazado'`)
    else where.push(Prisma.sql`(${STATE_SQL}) = ${filters.state}`)
  }
  if (filters.search !== null && filters.search !== "") {
    const term = filters.search
    where.push(Prisma.sql`(${accentMatches(Prisma.raw(`silabo.datos_academicos_silabo->'subject'->>'name'`), term)}
      or ${accentMatches(Prisma.raw(`silabo.datos_academicos_silabo->'subject'->>'code'`), term)}
      or exists (select 1 from convocatorias_carreras as convocatoria_busqueda
        inner join carreras as carrera_busqueda on carrera_busqueda.carrera_id = convocatoria_busqueda.carrera_id
        where convocatoria_busqueda.convocatoria_carrera_id = silabo.convocatoria_carrera_id
          and ${accentMatches(Prisma.raw("carrera_busqueda.nombre_carrera"), term)})
      or exists (select 1 from docentes_vigentes_silabo as docente_busqueda
        inner join usuarios as usuario_busqueda on usuario_busqueda.usuario_id = docente_busqueda.usuario_id
        where docente_busqueda.silabo_id = silabo.silabo_id
          and ${accentMatches(Prisma.raw("usuario_busqueda.nombre_usuario"), term)}))`)
  }
  if (filters.facultyId !== null) {
    where.push(Prisma.sql`exists (select 1 from convocatorias_carreras as convocatoria
      inner join carreras as carrera on carrera.carrera_id = convocatoria.carrera_id
      where convocatoria.convocatoria_carrera_id = silabo.convocatoria_carrera_id and carrera.facultad_id = ${filters.facultyId}::uuid)`)
  }
  const process =
    filters.period === "actual"
      ? current === null
        ? Prisma.sql` and proceso.convocatoria_universidad_id is null`
        : Prisma.sql` and proceso.convocatoria_universidad_id = ${current}::uuid`
      : current === null
        ? Prisma.sql` and proceso.convocatoria_universidad_id is not null`
        : Prisma.sql` and proceso.convocatoria_universidad_id != ${current}::uuid`
  const period = filters.periodId === null ? Prisma.empty : Prisma.sql` and periodo.periodo_academico_id = ${filters.periodId}::uuid`
  where.push(Prisma.sql`exists (select 1 from convocatorias_carreras as convocatoria
    inner join convocatorias_universidad as proceso on proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id
    inner join periodos_academicos as periodo on periodo.periodo_academico_id = proceso.periodo_academico_id
    where convocatoria.convocatoria_carrera_id = silabo.convocatoria_carrera_id${process}${period})`)
  if (filters.handledBy !== null) {
    where.push(Prisma.sql`(envios_biblioteca.verificado_por = ${filters.handledBy}::uuid
      or (revision.correccion_etapa = 'biblioteca' and revision.correccion_solicitada_por = ${filters.handledBy}::uuid))`)
  }
  return Prisma.join(
    where.map((condition) => Prisma.sql`(${condition})`),
    " and ",
  )
}

type PageRow = Omit<ReviewRow, "sentBy" | "signedBy"> & { sentBy: string; signedBy: string | null }

type SummaryRow = { id: string; subject: string; code: string; parallel: string; faculty: string | null; career: string; period: string }

export function createLibraryReviewRepository(db: Db): LibraryReviewRepository {
  const names = async (ids: string[]): Promise<Map<string, string>> => {
    if (ids.length === 0) return new Map()
    const found = await db.$queryRaw<{ id: string; name: string }[]>`select usuario_id::text as id, nombre_usuario as name from usuarios where usuario_id = any(${ids}::uuid[])`
    return new Map(found.map((row) => [row.id, row.name]))
  }
  return {
    async page(filters, page, perPage, sort = null) {
      const where = conditions(filters, await currentProcessId(db))
      const [{ total }] = await db.$queryRaw<{ total: number }[]>`select count(*)::int as total ${LIBRARY_FROM} where ${where}`
      if (total === 0) return { total: 0, items: [] }
      const found = await db.$queryRaw<PageRow[]>`select revision.revision_silabo_id::text as "revisionId", revision.silabo_id::text as "syllabusId",
          revision.numero_revision as "revisionNumber", revision.enviado_por::text as "sentBy", envios_biblioteca.verificado_por::text as "signedBy",
          ${isoText(Prisma.raw("revision.enviado_en"))} as "sentAt", ${STATE_SQL} as state, ${OUTCOME_SQL} as outcome, silabo.estado_silabo as "syllabusState", (${RESPONSIBLE_SQL})::text as "responsibleId"
        ${LIBRARY_FROM}
        where ${where}
        order by ${libraryOrder(sort)}
        limit ${perPage} offset ${(page - 1) * perPage}`
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
            syllabusState: row.syllabusState,
          }),
        ),
      }
    },
    async summaries(ids) {
      if (ids.length === 0) return new Map()
      const list = uuidList(ids)
      const found = await db.$queryRaw<SummaryRow[]>`select s.silabo_id::text as id,
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
        where s.silabo_id in (${list})`
      const teachers = await db.$queryRaw<{ silabo_id: string; nombre_usuario: string }[]>`select docentes_vigentes_silabo.silabo_id::text as silabo_id,
          usuarios.nombre_usuario
        from usuarios inner join docentes_vigentes_silabo on usuarios.usuario_id = docentes_vigentes_silabo.usuario_id
        where docentes_vigentes_silabo.silabo_id in (${list})`
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
      db.$queryRaw<{ id: string; name: string }[]>`select facultad_id::text as id, nombre_facultad as name from facultades
        where facultad_activa = true order by nombre_facultad asc`,
    async pastPeriods() {
      const current = await currentProcessId(db)
      const process = current === null ? Prisma.sql`convocatoria_universidad_id is not null` : Prisma.sql`convocatoria_universidad_id <> ${current}::uuid`
      return db.$queryRaw<{ id: string; code: string }[]>`select periodo_academico_id::text as id, codigo_periodo_academico as code from periodos_academicos
        where periodo_academico_id in (select periodo_academico_id from convocatorias_universidad where ${process})
        order by fecha_fin_periodo desc`
    },
    async existing(table, ids) {
      const [row] =
        table === "facultades"
          ? await db.$queryRaw<{ total: number }[]>`select count(*)::int as total from facultades where facultad_id = any(${ids}::uuid[])`
          : await db.$queryRaw<{ total: number }[]>`select count(*)::int as total from periodos_academicos where periodo_academico_id = any(${ids}::uuid[])`
      return row?.total ?? 0
    },
  }
}

export async function libraryReviewCounts(db: Db): Promise<Record<string, number>> {
  const filters: ReviewFilters = { state: null, search: null, facultyId: null, period: "actual", periodId: null, handledBy: null }
  const where = conditions(filters, await currentProcessId(db))
  const totals = await db.$queryRaw<{ state: string; outcome: string; total: number }[]>`select estado as state, resultado_envio as outcome, count(*)::int as total
    from (select silabo.estado_silabo as estado, ${OUTCOME_SQL} as resultado_envio ${LIBRARY_FROM} where ${where}) as envios group by estado, resultado_envio`
  const counts = { pendiente: 0, coordinacion: 0, firmado: 0, devuelto: 0 }
  for (const { state, outcome, total } of totals) {
    if (outcome === "reemplazado") continue
    for (const [key, shown] of Object.entries(SHOWN_STATE)) if (shown === state) counts[key as keyof typeof SHOWN_STATE] += Number(total)
    if (state === SHOWN_STATE.pendiente && outcome === "firmado") counts.coordinacion += Number(total)
  }
  return counts
}
