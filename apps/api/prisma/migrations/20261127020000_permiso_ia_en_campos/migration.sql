BEGIN;

ALTER TABLE "campos_plantilla" ADD COLUMN "lectura_ia_permitida" boolean NOT NULL DEFAULT false;

DROP TRIGGER "marcar_cambio_campo_plantilla" ON "campos_plantilla";
ALTER TABLE "campos_plantilla" DISABLE TRIGGER "marcar_actualizado_en";

UPDATE "campos_plantilla" c
SET "lectura_ia_permitida" = true
FROM "permisos_lectura_ia" p
WHERE p."plantilla_id" = c."plantilla_id"
    AND p."clave_campo_plantilla" = c."clave_campo_plantilla"
    AND p."lectura_permitida"
    AND c."vigente_en_plantilla";

ALTER TABLE "campos_plantilla" ENABLE TRIGGER "marcar_actualizado_en";

CREATE TRIGGER "marcar_cambio_campo_plantilla"
    AFTER INSERT OR DELETE OR UPDATE OF "campo_plantilla_id", "seccion_plantilla_id", "plantilla_id", "clave_campo_plantilla",
        "titulo_campo_plantilla", "posicion_campo_plantilla", "vigente_en_plantilla", "creado_en", "actualizado_en"
    ON "campos_plantilla" FOR EACH ROW EXECUTE FUNCTION "marcar_cambio_plantilla"();

DROP TABLE "permisos_lectura_ia";

COMMIT;
