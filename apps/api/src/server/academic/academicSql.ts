import { Prisma } from "../../generated/prisma/client"

export const SYLLABUS_SCOPE = Prisma.sql`exists (select * from convocatorias_carreras where silabos.convocatoria_carrera_id = convocatorias_carreras.convocatoria_carrera_id
  and exists (select * from convocatorias_universidad where convocatorias_carreras.convocatoria_universidad_id = convocatorias_universidad.convocatoria_universidad_id))`

export const IN_PROGRESS = Prisma.sql`exists (select * from convocatorias_carreras where silabos.convocatoria_carrera_id = convocatorias_carreras.convocatoria_carrera_id
  and estado_convocatoria_carrera in ('abierta', 'pausada')
  and exists (select * from convocatorias_universidad where convocatorias_carreras.convocatoria_universidad_id = convocatorias_universidad.convocatoria_universidad_id
    and estado_convocatoria_universidad in ('abierto', 'pausado'))
  and exists (select * from convocatorias_universidad where convocatorias_carreras.convocatoria_universidad_id = convocatorias_universidad.convocatoria_universidad_id))`

export const TOUCHED_SYLLABUS = Prisma.sql`(silabos.estado_silabo != 'sin_iniciar' or silabos.iniciado_en is not null
  or exists (select * from convocatorias_carreras where silabos.convocatoria_carrera_id = convocatorias_carreras.convocatoria_carrera_id
    and estado_convocatoria_carrera = 'cerrada'
    and exists (select * from convocatorias_universidad where convocatorias_carreras.convocatoria_universidad_id = convocatorias_universidad.convocatoria_universidad_id)))`

export const IN_CAREER = (careerId: string) => Prisma.sql`exists (select * from asignaturas where paralelos.asignatura_id = asignaturas.asignatura_id
  and asignaturas.carrera_id = ${careerId}::uuid)`
