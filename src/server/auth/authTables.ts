import { boolean, customType, pgTable, uuid, varchar } from "drizzle-orm/pg-core"
import { cuentasUsuario, dosFactoresUsuario, sesionesUsuario, verificacionesUsuario } from "@/db/schema/auth"

const momentFlag = customType<{ data: boolean; driverData: string | null }>({
  dataType: () => "timestamp(0) with time zone",
  toDriver: (value) => (value ? new Date().toISOString() : null),
  fromDriver: (value) => value !== null,
})

export const authUsers = pgTable("usuarios", {
  id: uuid("usuario_id").primaryKey(),
  name: varchar("nombre_usuario", { length: 255 }).notNull(),
  email: varchar("correo_electronico", { length: 255 }).notNull(),
  emailVerified: momentFlag("correo_verificado_en"),
  twoFactorEnabled: momentFlag("dos_factores_confirmado_en"),
  active: boolean("usuario_activo").notNull(),
})

export const authTables = {
  user: authUsers,
  session: sesionesUsuario,
  account: cuentasUsuario,
  verification: verificacionesUsuario,
  twoFactor: dosFactoresUsuario,
}
