import type { Db } from "../../prisma/db"

export async function careerSyllabusSubjects(db: Db, careerId: string): Promise<string[]> {
  const rows = await db.asignaturas.findMany({
    where: { carrera_id: careerId, asignatura_activa: true, genera_silabo_asignatura: true, mallas: { estado_malla: { not: "cerrada" } } },
    select: { asignatura_id: true },
    orderBy: [{ ciclo_asignatura: "asc" }, { orden_asignatura_en_ciclo: "asc" }, { codigo_asignatura: "asc" }, { asignatura_id: "asc" }],
  })
  return rows.map((row) => row.asignatura_id)
}
