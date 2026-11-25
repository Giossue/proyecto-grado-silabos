import { Inject, Injectable } from "@nestjs/common"
import { libraryStatusLabel } from "@silabos/shared/lib/libraryStates"
import type { LibrarySort, ListSort } from "@silabos/shared/schemas/listSort"
import { Prisma } from "../../generated/prisma/client"
import { PrismaService } from "../../prisma/prisma.service"
import type { FilterTable, LibraryReviewRepository, ReviewFilters, ReviewRow, SyllabusSummary } from "../../server/library/reviews"

const FOLD_FROM = "áéíóúüñÁÉÍÓÚÜÑ"
const FOLD_TO = "aeiouunAEIOUUN"

function accentPattern(term: string): string {
  const folded = [...term].map((character) => {
    const index = [...FOLD_FROM].indexOf(character)
    return index === -1 ? character : [...FOLD_TO][index]
  })
  return `%${folded.join("").replace(/[%_\\]/g, (character) => `\\${character}`)}%`
}

function accentMatches(column: string, term: string): Prisma.Sql {
  return Prisma.sql`translate(${Prisma.raw(column)}, ${Prisma.raw(`'${FOLD_FROM}'`)}, ${Prisma.raw(`'${FOLD_TO}'`)}) ILIKE ${accentPattern(term)}`
}

const OUTCOME = Prisma.raw(`CASE
            WHEN envios_biblioteca.verificado_en IS NOT NULL THEN 'firmado'
            WHEN revision.correccion_etapa = 'biblioteca' THEN 'devuelto'
            WHEN EXISTS (
                SELECT 1 FROM revisiones_silabo posterior
                WHERE posterior.silabo_id = revision.silabo_id AND posterior.numero_revision > revision.numero_revision
            ) THEN 'reemplazado'
            ELSE 'pendiente'
        END`)

const RESPONSIBLE = Prisma.raw(`COALESCE(
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

const STATE = Prisma.sql`CASE (${OUTCOME}) WHEN 'pendiente' THEN 'pendiente' ELSE 'atendido' END`

const FROM = Prisma.sql`from envios_biblioteca
  inner join revisiones_silabo as revision on revision.revision_silabo_id = envios_biblioteca.revision_silabo_id
  inner join silabos as silabo on silabo.silabo_id = revision.silabo_id`

const CONVOCATION_OF = (column: string) => Prisma.sql`(select ${Prisma.raw(column)} from convocatorias_carreras as convocatoria_orden
  inner join carreras as carrera_orden on carrera_orden.carrera_id = convocatoria_orden.carrera_id
  left join facultades as facultad_orden on facultad_orden.facultad_id = carrera_orden.facultad_id
  inner join convocatorias_universidad as proceso_orden on proceso_orden.convocatoria_universidad_id = convocatoria_orden.convocatoria_universidad_id
  inner join periodos_academicos as periodo_orden on periodo_orden.periodo_academico_id = proceso_orden.periodo_academico_id
  where convocatoria_orden.convocatoria_carrera_id = silabo.convocatoria_carrera_id)`

const USER_NAME = (id: Prisma.Sql) => Prisma.sql`(select usuario_orden.nombre_usuario from usuarios as usuario_orden where usuario_orden.usuario_id = ${id})`

const SORT_KEYS: Record<LibrarySort, Prisma.Sql> = {
  faculty: CONVOCATION_OF("facultad_orden.nombre_facultad"),
  career: CONVOCATION_OF("carrera_orden.nombre_carrera"),
  subject: Prisma.sql`(select case when jsonb_typeof(silabo.datos_academicos_silabo #> '{subject,name}') = 'string'
      then silabo.datos_academicos_silabo #>> '{subject,name}' else asignatura_orden.nombre_asignatura end
    from paralelos as paralelo_orden inner join asignaturas as asignatura_orden on asignatura_orden.asignatura_id = paralelo_orden.asignatura_id
    where paralelo_orden.paralelo_id = silabo.paralelo_id)`,
  responsible: USER_NAME(Prisma.sql`(${RESPONSIBLE})`),
  state: Prisma.sql`case (${OUTCOME}) ${Prisma.join(
    ["pendiente", "firmado", "devuelto", "reemplazado"].map((status) => Prisma.sql`when ${status} then ${libraryStatusLabel(status)}::text`),
    " ",
  )} end`,
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

function conditions(filters: ReviewFilters, current: string | null): Prisma.Sql {
  const where: Prisma.Sql[] = [
    Prisma.sql`envios_biblioteca.verificacion_heredada = false`,
    Prisma.sql`not exists (select 1 from revisiones_silabo as posterior
      inner join envios_biblioteca as envio_posterior on envio_posterior.revision_silabo_id = posterior.revision_silabo_id
      where envio_posterior.verificacion_heredada = false and posterior.silabo_id = revision.silabo_id
        and posterior.numero_revision > revision.numero_revision)`,
  ]
  if (filters.state !== null) {
    where.push(["firmado", "devuelto", "reemplazado"].includes(filters.state) ? Prisma.sql`(${OUTCOME}) = ${filters.state}` : Prisma.sql`(${STATE}) = ${filters.state}`)
  }
  if (filters.search !== null && filters.search !== "") {
    const term = filters.search
    where.push(Prisma.sql`(${accentMatches("silabo.datos_academicos_silabo->'subject'->>'name'", term)}
      or ${accentMatches("silabo.datos_academicos_silabo->'subject'->>'code'", term)}
      or exists (select 1 from convocatorias_carreras as convocatoria_busqueda
        inner join carreras as carrera_busqueda on carrera_busqueda.carrera_id = convocatoria_busqueda.carrera_id
        where convocatoria_busqueda.convocatoria_carrera_id = silabo.convocatoria_carrera_id
          and ${accentMatches("carrera_busqueda.nombre_carrera", term)})
      or exists (select 1 from docentes_vigentes_silabo as docente_busqueda
        inner join usuarios as usuario_busqueda on usuario_busqueda.usuario_id = docente_busqueda.usuario_id
        where docente_busqueda.silabo_id = silabo.silabo_id
          and ${accentMatches("usuario_busqueda.nombre_usuario", term)}))`)
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

type PageRow = {
  revisionId: string
  syllabusId: string
  revisionNumber: number
  sentBy: string
  signedBy: string | null
  sentAt: string
  state: string
  outcome: string | null
  responsibleId: string | null
}

type SummaryRow = { id: string; subject: string; code: string; parallel: string; faculty: string | null; career: string; period: string }

@Injectable()
export class LibraryReviewsRepository implements LibraryReviewRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async currentProcessId(): Promise<string | null> {
    const row = await this.prisma.convocatorias_universidad.findFirst({
      select: { convocatoria_universidad_id: true },
      orderBy: [{ fecha_inicio: "desc" }, { convocatoria_universidad_id: "desc" }],
    })
    return row?.convocatoria_universidad_id ?? null
  }

  async page(filters: ReviewFilters, page: number, perPage: number, sort: ListSort<LibrarySort> = null): Promise<{ total: number; items: ReviewRow[] }> {
    const where = conditions(filters, await this.currentProcessId())
    const [{ total }] = await this.prisma.$queryRaw<{ total: number }[]>`select count(*)::int as total ${FROM} where ${where}`
    if (total === 0) return { total: 0, items: [] }
    const found = await this.prisma.$queryRaw<PageRow[]>`select revision.revision_silabo_id::text as "revisionId", revision.silabo_id::text as "syllabusId",
        revision.numero_revision as "revisionNumber", revision.enviado_por::text as "sentBy", envios_biblioteca.verificado_por::text as "signedBy",
        to_char(revision.enviado_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"') as "sentAt",
        ${STATE} as "state", ${OUTCOME} as "outcome", (${RESPONSIBLE})::text as "responsibleId"
      ${FROM}
      where ${where}
      order by ${libraryOrder(sort)}
      limit ${perPage} offset ${(page - 1) * perPage}`
    const people = await this.userNames([...new Set(found.flatMap((row) => [row.sentBy, ...(row.signedBy ? [row.signedBy] : [])]))])
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
  }

  async summaries(ids: string[]): Promise<Map<string, SyllabusSummary>> {
    if (ids.length === 0) return new Map()
    const list = Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))
    const found = await this.prisma.$queryRaw<SummaryRow[]>`select s.silabo_id::text as id,
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
    const teachers = await this.prisma.$queryRaw<{ silabo_id: string; nombre_usuario: string }[]>`select docentes_vigentes_silabo.silabo_id::text as silabo_id, usuarios.nombre_usuario
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
  }

  async userNames(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map()
    const found = await this.prisma.usuarios.findMany({ where: { usuario_id: { in: ids } }, select: { usuario_id: true, nombre_usuario: true } })
    return new Map(found.map((row) => [row.usuario_id, row.nombre_usuario]))
  }

  async faculties(): Promise<{ id: string; name: string }[]> {
    const found = await this.prisma.facultades.findMany({ where: { facultad_activa: true }, select: { facultad_id: true, nombre_facultad: true }, orderBy: { nombre_facultad: "asc" } })
    return found.map((row) => ({ id: row.facultad_id, name: row.nombre_facultad }))
  }

  async pastPeriods(): Promise<{ id: string; code: string }[]> {
    const current = await this.currentProcessId()
    const found = await this.prisma.periodos_academicos.findMany({
      where: { convocatorias_universidad: { is: current === null ? {} : { convocatoria_universidad_id: { not: current } } } },
      select: { periodo_academico_id: true, codigo_periodo_academico: true },
      orderBy: { fecha_fin_periodo: "desc" },
    })
    return found.map((row) => ({ id: row.periodo_academico_id, code: row.codigo_periodo_academico }))
  }

  existing(table: FilterTable, ids: string[]): Promise<number> {
    return table === "facultades"
      ? this.prisma.facultades.count({ where: { facultad_id: { in: ids } } })
      : this.prisma.periodos_academicos.count({ where: { periodo_academico_id: { in: ids } } })
  }
}
