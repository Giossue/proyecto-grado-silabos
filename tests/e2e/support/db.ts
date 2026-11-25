import fs from "node:fs"
import path from "node:path"
import { Client } from "pg"

const databaseUrl = (): string => {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const env = fs.readFileSync(path.resolve(__dirname, "../../../.env.local"), "utf8")
  const line = env.split("\n").find((entry) => entry.startsWith("DATABASE_URL="))
  if (!line) throw new Error("DATABASE_URL must be set to run the E2E suite.")
  return line.slice("DATABASE_URL=".length).trim()
}

export async function query<T extends Record<string, unknown>>(text: string, values: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: databaseUrl() })
  await client.connect()
  try {
    return (await client.query<T>(text, values)).rows
  } finally {
    await client.end()
  }
}

export async function expireInvitation(email: string): Promise<void> {
  await query(
    `update invitaciones_activacion set expira_en = now() - interval '1 day'
      where usada_en is null and invalidada_en is null
        and usuario_id = (select usuario_id from usuarios where correo_electronico = $1)`,
    [email],
  )
}

export async function addUnreadNotices(email: string, count: number): Promise<void> {
  await query(
    `insert into notificaciones (notificacion_id, usuario_id, clave_unica, tipo_notificacion, titulo_notificacion, mensaje_notificacion, periodo_academico_id, notificado_en)
     select gen_random_uuid(), u.usuario_id, 'e2e:' || gen_random_uuid(), 'sistema.prueba', 'Aviso de prueba', 'Aviso creado por la prueba de extremo a extremo.',
            (select cu.periodo_academico_id from convocatorias_universidad cu order by cu.fecha_inicio desc, cu.convocatoria_universidad_id desc limit 1),
            now() - (serie.posicion || ' seconds')::interval
       from usuarios u cross join generate_series(1, $2::int) as serie(posicion)
      where u.correo_electronico = $1`,
    [email, count],
  )
}

export async function userName(email: string): Promise<string> {
  const [row] = await query<{ nombre_usuario: string }>("select nombre_usuario from usuarios where correo_electronico = $1", [email])
  return row.nombre_usuario
}

export async function latestSyllabusOf(email: string): Promise<string> {
  const [row] = await query<{ id: string }>(
    `select s.silabo_id::text as id
       from silabos s
       join asignaciones_paralelo ap on ap.paralelo_id = s.paralelo_id and ap.asignacion_paralelo_activa
       join asignaciones_rol ar on ar.asignacion_rol_id = ap.asignacion_rol_id
       join usuarios u on u.usuario_id = ar.usuario_id
      where u.correo_electronico = $1
      order by s.silabo_id desc
      limit 1`,
    [email],
  )
  return row.id
}
