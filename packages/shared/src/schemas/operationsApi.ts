import { z } from "zod"

const confirmRedo = z.boolean().optional().describe("Confirma que los sílabos del período se adapten a la plantilla nueva.")

export const processCreationBody = z.object({
  period_id: z.string().describe("Período académico (UUID) sin proceso de sílabos."),
  starts_at: z.string().describe("Fecha de inicio (AAAA-MM-DD); no puede ser anterior a hoy."),
  due_at: z.string().describe("Fecha límite (AAAA-MM-DD); posterior al inicio y dentro del período."),
})

export const redoConfirmationBody = z.object({ confirmar_rehacer: confirmRedo })

export const deadlineExtensionBody = z.object({
  due_at: z.string().describe("Nueva fecha límite (AAAA-MM-DD); posterior a la vigente y no después del último día de clases."),
  confirmar_rehacer: confirmRedo,
  confirmar_cambios: z.boolean().optional().describe("Confirma aplicar los cambios hechos mientras el proceso de sílabos estuvo finalizado."),
})

const currentPassword = z.string().describe("Contraseña actual de quien guarda.")

export const notificationSettingsBody = z.object({
  emails: z.boolean().describe("Envía los avisos por correo."),
  digest_time: z.string().describe("Hora del resumen diario (HH:MM)."),
})

export const teacherAssistantSettingsBody = z.object({
  enabled: z.boolean().describe("Activa el asistente de IA en el sílabo del docente."),
})

export const librarySettingsBody = z.object({
  current_password: currentPassword,
  driver: z.enum(["disabled", "koha"]),
  base_url: z.string().max(255).nullable().optional().describe("Dirección del catálogo Koha; obligatoria con Koha."),
})
