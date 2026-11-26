DROP TABLE IF EXISTS "sesiones";
ALTER TABLE "usuarios" DROP COLUMN IF EXISTS "codigo_recordarme";
DROP SCHEMA IF EXISTS "drizzle" CASCADE;

DELETE FROM "sesiones_usuario" WHERE "expires_at" < now();
DELETE FROM "verificaciones_usuario" WHERE "expires_at" < now();

ALTER TABLE "campos_plantilla" DROP CONSTRAINT "campos_plantilla_seccion_plantilla_id_foreign";
ALTER TABLE "definiciones_campo" DROP CONSTRAINT "definiciones_campo_campo_plantilla_id_foreign";

DROP INDEX "paralelos_asignatura_id_index";
DROP INDEX "usuarios_usuario_activo_index";
ALTER TABLE "asignaturas" DROP CONSTRAINT "asignaturas_identidad_carrera_unica";

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "firmas_silabo" AS firma
        JOIN "revisiones_silabo" AS revision ON revision."revision_silabo_id" = firma."revision_silabo_id"
        WHERE revision."silabo_id" <> firma."silabo_id"
    ) THEN
        RAISE EXCEPTION 'firmas_silabo has signatures whose silabo_id differs from their revision';
    END IF;
END;
$$;
ALTER TABLE "revisiones_silabo" ADD CONSTRAINT "revisiones_silabo_revision_silabo_id_silabo_id_unica" UNIQUE ("revision_silabo_id", "silabo_id");
ALTER TABLE "firmas_silabo" ADD CONSTRAINT "firmas_silabo_revision_silabo_id_silabo_id_fk" FOREIGN KEY ("revision_silabo_id", "silabo_id") REFERENCES "revisiones_silabo" ("revision_silabo_id", "silabo_id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "firmas_silabo" DROP CONSTRAINT "firmas_silabo_revision_silabo_id_foreign";
ALTER TABLE "firmas_silabo" DROP CONSTRAINT "firmas_silabo_silabo_id_foreign";

CREATE INDEX "notificaciones_periodo_academico_id_idx" ON "notificaciones" ("periodo_academico_id");
CREATE INDEX "sesiones_usuario_active_role_assignment_id_idx" ON "sesiones_usuario" ("active_role_assignment_id");
