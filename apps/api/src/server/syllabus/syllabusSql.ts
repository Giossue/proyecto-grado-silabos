import { Prisma } from "../../generated/prisma/client"
import { iso8601 } from "../../prisma/sql"

export function careerLabelSql(alias: string): Prisma.Sql {
  const career = Prisma.raw(alias)
  return Prisma.sql`(case when (select count(*) from carreras mismo_nombre where mismo_nombre.nombre_carrera = ${career}.nombre_carrera) > 1
    then ${career}.nombre_carrera || ' · ' || coalesce(${career}.codigo_carrera, '') else ${career}.nombre_carrera end)`
}

/** True when the subject (table alias) belongs to a malla that is not closed, i.e. any of the career's vigente mallas (estado_malla is only vigente or cerrada; a career may have several vigente mallas): subjects of a closed malla never get new syllabi nor count as pending. */
export function openCurriculum(subject: string): Prisma.Sql {
  return Prisma.sql`exists (select 1 from mallas malla_abierta where malla_abierta.malla_id = ${Prisma.raw(subject)}.malla_id and malla_abierta.estado_malla <> 'cerrada')`
}

/** How a malla (table alias) is shown to people: «Malla <código>», e.g. «Malla SW-8» (scheduled subjects, the syllabus academic context). */
export function mallaLabelSql(malla: string): Prisma.Sql {
  return Prisma.sql`('Malla ' || ${Prisma.raw(malla)}.codigo_malla)`
}

export const CURRENT_PROCESS = Prisma.sql`(select actual.convocatoria_universidad_id from convocatorias_universidad actual
  order by actual.fecha_inicio desc, actual.convocatoria_universidad_id desc limit 1)`

export const SYLLABUS_JOINS = Prisma.sql`inner join convocatorias_carreras convocatoria on convocatoria.convocatoria_carrera_id = silabos.convocatoria_carrera_id
  inner join convocatorias_universidad proceso on proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id
  inner join periodos_academicos periodo on periodo.periodo_academico_id = proceso.periodo_academico_id
  inner join paralelos paralelo on paralelo.paralelo_id = silabos.paralelo_id
  inner join asignaturas asignatura on asignatura.asignatura_id = paralelo.asignatura_id
  inner join carreras carrera on carrera.carrera_id = convocatoria.carrera_id`

function contextText(path: string[], fallback: string): Prisma.Sql {
  const pointer = path.map((segment) => `'${segment}'`).join("->")
  return Prisma.raw(`(case when jsonb_typeof(silabos.datos_academicos_silabo->${pointer}) = 'string'
    then silabos.datos_academicos_silabo->${path.slice(0, -1).map((segment) => `'${segment}'`).join("->")}->>'${path[path.length - 1]}' else ${fallback} end)`)
}

export const SUBJECT_NAME = contextText(["subject", "name"], "asignatura.nombre_asignatura")
export const SUBJECT_CODE = contextText(["subject", "code"], "asignatura.codigo_asignatura")
export const PARALLEL_CODE = contextText(["parallel", "code"], "paralelo.codigo_paralelo")

export const SYLLABUS_DETAIL_COLUMNS = Prisma.sql`silabos.silabo_id::text as id, silabos.estado_silabo as state,
  convocatoria.convocatoria_carrera_id::text as convocation_id, convocatoria.carrera_id::text as career_id, ${careerLabelSql("carrera")} as career, carrera.codigo_carrera as career_code,
  ${SUBJECT_NAME} as subject, ${SUBJECT_CODE} as code, ${PARALLEL_CODE} as parallel, asignatura.nombre_asignatura as live_subject,
  periodo.codigo_periodo_academico as period, to_char(periodo.fecha_fin_periodo, 'YYYY-MM-DD') as period_ends_on,
  ${iso8601(Prisma.raw("silabos.iniciado_en"))} as started_at, ${iso8601(Prisma.raw("silabos.guardado_en"))} as saved_at`

export type SyllabusDetailRow = {
  id: string
  state: string
  convocation_id: string
  career_id: string
  career: string
  career_code: string
  subject: string
  code: string
  parallel: string
  live_subject: string
  period: string
  period_ends_on: string
  started_at: string | null
  saved_at: string | null
}

export const SYLLABUS_EXISTS = Prisma.sql`exists (select 1 from convocatorias_carreras convocatoria_vigente
  where convocatoria_vigente.convocatoria_carrera_id = silabos.convocatoria_carrera_id
    and exists (select 1 from convocatorias_universidad proceso_vigente where proceso_vigente.convocatoria_universidad_id = convocatoria_vigente.convocatoria_universidad_id))`

export function careerIs(column: Prisma.Sql, careerId: string | null): Prisma.Sql {
  return careerId === null ? Prisma.sql`${column} is null` : Prisma.sql`${column} = ${careerId}::uuid`
}

export function convocationWhere(condition: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`exists (select 1 from convocatorias_carreras convocatoria_filtro
    where convocatoria_filtro.convocatoria_carrera_id = silabos.convocatoria_carrera_id and ${condition}
      and exists (select 1 from convocatorias_universidad proceso_filtro where proceso_filtro.convocatoria_universidad_id = convocatoria_filtro.convocatoria_universidad_id))`
}

export function currentTeacherSql(userId: string): Prisma.Sql {
  return Prisma.sql`exists (select 1 from docentes_vigentes_silabo docente inner join usuarios docente_usuario on docente_usuario.usuario_id = docente.usuario_id
    where docente.silabo_id = silabos.silabo_id and docente.usuario_id = ${userId}::uuid and docente_usuario.usuario_activo = true)`
}

export function writtenBySql(userId: string): Prisma.Sql {
  return Prisma.sql`(exists (select 1 from revisiones_silabo enviada where enviada.silabo_id = silabos.silabo_id and enviada.enviado_por = ${userId}::uuid)
    or (not exists (select 1 from revisiones_silabo cualquiera where cualquiera.silabo_id = silabos.silabo_id) and ${currentTeacherSql(userId)}))`
}

export const IN_CURRENT_PERIOD = convocationWhere(Prisma.sql`convocatoria_filtro.convocatoria_universidad_id = ${CURRENT_PROCESS}`)
export const IN_PAST_PERIOD = convocationWhere(Prisma.sql`convocatoria_filtro.convocatoria_universidad_id != ${CURRENT_PROCESS}`)
