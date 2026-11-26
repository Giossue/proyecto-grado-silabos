ALTER TABLE "mensajes_ia_plantilla"
    ADD COLUMN "rol" VARCHAR(20),
    ADD COLUMN "estado" VARCHAR(20),
    ADD COLUMN "codigo_error" TEXT,
    ADD COLUMN "completado_en" TIMESTAMPTZ(6),
    ADD COLUMN "clave_idempotencia" TEXT;

ALTER TABLE "mensajes_ia_plantilla" DISABLE TRIGGER "marcar_actualizado_en";

UPDATE "mensajes_ia_plantilla"
SET "rol" = "contenido_mensaje" ->> 'rol',
    "estado" = "contenido_mensaje" ->> 'estado',
    "codigo_error" = "contenido_mensaje" ->> 'codigo_error',
    "completado_en" = nullif("contenido_mensaje" ->> 'completado_en', '')::timestamptz,
    "clave_idempotencia" = "contenido_mensaje" -> 'entrada' ->> 'clave_idempotencia';

UPDATE "mensajes_ia_plantilla"
SET "contenido_mensaje" = CASE
        WHEN jsonb_typeof("contenido_mensaje" -> 'entrada') = 'object'
            THEN jsonb_set("contenido_mensaje" - 'rol' - 'estado' - 'codigo_error' - 'completado_en', '{entrada}', ("contenido_mensaje" -> 'entrada') - 'clave_idempotencia')
        ELSE "contenido_mensaje" - 'rol' - 'estado' - 'codigo_error' - 'completado_en'
    END;

ALTER TABLE "mensajes_ia_plantilla" ENABLE TRIGGER "marcar_actualizado_en";

ALTER TABLE "mensajes_ia_plantilla"
    ALTER COLUMN "rol" SET NOT NULL,
    ALTER COLUMN "estado" SET NOT NULL;

DROP INDEX "mensajes_ia_plantilla_idempotencia_unica";
ALTER TABLE "mensajes_ia_plantilla" DROP CONSTRAINT "mensajes_ia_plantilla_contenido_check";

ALTER TABLE "mensajes_ia_plantilla" ADD CONSTRAINT "mensajes_ia_plantilla_rol_check" CHECK ("rol" IN ('usuario', 'asistente'));
ALTER TABLE "mensajes_ia_plantilla" ADD CONSTRAINT "mensajes_ia_plantilla_estado_check" CHECK ("estado" IN ('pendiente', 'en_ejecucion', 'completado', 'fallido'));
ALTER TABLE "mensajes_ia_plantilla" ADD CONSTRAINT "mensajes_ia_plantilla_contenido_check" CHECK (
    jsonb_typeof("contenido_mensaje") = 'object'
    AND NOT ("contenido_mensaje" ?| ARRAY['rol', 'estado', 'codigo_error', 'completado_en'])
    AND NOT coalesce(("contenido_mensaje" -> 'entrada') ? 'clave_idempotencia', false)
);

CREATE UNIQUE INDEX "mensajes_ia_plantilla_idempotencia_unica" ON "mensajes_ia_plantilla" ("plantilla_id", "usuario_id", "clave_idempotencia") WHERE "rol" = 'usuario';
