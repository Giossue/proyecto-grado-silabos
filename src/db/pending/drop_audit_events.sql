DROP TRIGGER IF EXISTS proteger_evento_auditoria_db ON eventos_auditoria;--> statement-breakpoint
DROP INDEX IF EXISTS eventos_auditoria_asignacion_rol_id_index;--> statement-breakpoint
DROP INDEX IF EXISTS eventos_auditoria_ocurrido_en_index;--> statement-breakpoint
DROP INDEX IF EXISTS eventos_auditoria_recurso_fecha_idx;--> statement-breakpoint
DROP INDEX IF EXISTS eventos_auditoria_usuario_fecha_idx;--> statement-breakpoint
DROP TABLE IF EXISTS eventos_auditoria;
