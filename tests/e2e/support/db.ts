import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { Client } from "pg"
import { scratchDir } from "./accounts"

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

export type DatabaseSnapshot = { restore(): void }

export function snapshotDatabase(name: string): DatabaseSnapshot {
  fs.mkdirSync(scratchDir, { recursive: true })
  const directory = fs.mkdtempSync(path.join(scratchDir, "db-"))
  const file = path.join(directory, `${name}.dump`)
  execFileSync("pg_dump", ["-Fc", "--no-owner", "-f", file, databaseUrl()], { stdio: "inherit" })
  return {
    restore() {
      execFileSync("pg_restore", ["--clean", "--if-exists", "--no-owner", "--single-transaction", "-d", databaseUrl(), file], { stdio: "inherit" })
      fs.rmSync(directory, { recursive: true, force: true })
    },
  }
}

export async function latestCareerRevisionOf(coordinatorEmail: string): Promise<string | null> {
  const [row] = await query<{ id: string }>(
    `select r.revision_silabo_id::text as id
       from revisiones_silabo r
       join silabos s on s.silabo_id = r.silabo_id
       join paralelos p on p.paralelo_id = s.paralelo_id
       join asignaturas a on a.asignatura_id = p.asignatura_id
       join asignaciones_rol ar on ar.carrera_id = a.carrera_id and ar.asignacion_rol_activa and ar.rol = 'coordinador'
       join usuarios u on u.usuario_id = ar.usuario_id
      where u.correo_electronico = $1
      order by r.enviado_en desc
      limit 1`,
    [coordinatorEmail],
  )
  return row?.id ?? null
}

export async function latestLibraryRevision(): Promise<string | null> {
  const [row] = await query<{ id: string }>(
    `select r.revision_silabo_id::text as id
       from envios_biblioteca e
       join revisiones_silabo r on r.revision_silabo_id = e.revision_silabo_id
      order by r.enviado_en desc
      limit 1`,
  )
  return row?.id ?? null
}

export async function approvedCareerRevisionOf(coordinatorEmail: string): Promise<string | null> {
  const [row] = await query<{ id: string }>(
    `select r.revision_silabo_id::text as id
       from revisiones_silabo r
       join aprobaciones ap on ap.revision_silabo_id = r.revision_silabo_id
       join exportaciones_silabo ex on ex.revision_silabo_id = r.revision_silabo_id
       join silabos s on s.silabo_id = r.silabo_id
       join paralelos p on p.paralelo_id = s.paralelo_id
       join asignaturas a on a.asignatura_id = p.asignatura_id
       join asignaciones_rol ar on ar.carrera_id = a.carrera_id and ar.asignacion_rol_activa and ar.rol = 'coordinador'
       join usuarios u on u.usuario_id = ar.usuario_id
      where u.correo_electronico = $1
      order by ap.aprobado_en desc
      limit 1`,
    [coordinatorEmail],
  )
  return row?.id ?? null
}
