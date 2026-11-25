import { and, eq } from "drizzle-orm"
import { pgView } from "drizzle-orm/pg-core"
import { asignacionesParalelo, asignacionesRol, silabos } from "./tables"

export const docentesVigentesSilabo = pgView("docentes_vigentes_silabo").as((qb) =>
  qb
    .select({
      silaboId: silabos.silaboId,
      usuarioId: asignacionesRol.usuarioId,
      asignacionRolId: asignacionesRol.asignacionRolId,
      asignacionParaleloId: asignacionesParalelo.asignacionParaleloId,
      paraleloId: silabos.paraleloId,
    })
    .from(silabos)
    .innerJoin(asignacionesParalelo, and(eq(asignacionesParalelo.paraleloId, silabos.paraleloId), asignacionesParalelo.asignacionParaleloActiva))
    .innerJoin(
      asignacionesRol,
      and(eq(asignacionesRol.asignacionRolId, asignacionesParalelo.asignacionRolId), asignacionesRol.asignacionRolActiva, eq(asignacionesRol.rol, "docente")),
    ),
)
