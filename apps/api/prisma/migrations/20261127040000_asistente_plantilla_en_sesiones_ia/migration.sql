BEGIN;

CREATE UNIQUE INDEX "mensajes_ia_propuesta_unica" ON "mensajes_ia" ((("contenido_mensaje" -> 'propuesta') ->> 'id'));

CREATE TEMP TABLE "sesiones_trasladadas" ON COMMIT DROP AS
SELECT gen_random_uuid() AS "sesion_ia_id", "usuario_id", "plantilla_id", "ocultado_en" AS "cerrada_en",
    min("enviado_en") AS "creado_en", max("actualizado_en") AS "actualizado_en"
FROM "mensajes_ia_plantilla"
GROUP BY "usuario_id", "plantilla_id", "ocultado_en";

INSERT INTO "sesiones_ia" ("sesion_ia_id", "usuario_id", "plantilla_id", "cerrada_en", "creado_en", "actualizado_en")
SELECT "sesion_ia_id", "usuario_id", "plantilla_id", "cerrada_en", "creado_en", "actualizado_en"
FROM "sesiones_trasladadas";

WITH "origen" AS (
    SELECT m.*, s."sesion_ia_id",
        CASE WHEN q."mensaje_ia_plantilla_id" IS NOT NULL AND m."rol" = 'asistente' THEN q."mensaje_ia_plantilla_id" END AS "pregunta_id",
        m."estado" IN ('pendiente', 'en_ejecucion') AS "abierto"
    FROM "mensajes_ia_plantilla" m
    JOIN "sesiones_trasladadas" s ON s."usuario_id" = m."usuario_id" AND s."plantilla_id" = m."plantilla_id"
        AND s."cerrada_en" IS NOT DISTINCT FROM m."ocultado_en"
    LEFT JOIN "mensajes_ia_plantilla" q ON q."mensaje_ia_plantilla_id"::text = m."contenido_mensaje" -> 'entrada' ->> 'respuesta_a_id'
), "ordenado" AS (
    SELECT o.*,
        row_number() OVER (PARTITION BY o."pregunta_id" ORDER BY o."enviado_en", o."mensaje_ia_plantilla_id") AS "orden_respuesta",
        row_number() OVER (PARTITION BY o."sesion_ia_id", o."abierto" ORDER BY o."enviado_en" DESC, o."mensaje_ia_plantilla_id" DESC) AS "orden_abierto"
    FROM "origen" o
)
INSERT INTO "mensajes_ia" ("mensaje_ia_id", "sesion_ia_id", "respuesta_a_id", "rol", "estado", "contenido_mensaje", "codigo_error",
    "clave_idempotencia", "completado_en", "creado_en", "actualizado_en")
SELECT o."mensaje_ia_plantilla_id", o."sesion_ia_id",
    CASE WHEN o."orden_respuesta" = 1 THEN o."pregunta_id" END,
    o."rol",
    CASE WHEN o."rol" = 'usuario' THEN 'completado' WHEN o."abierto" AND o."orden_abierto" > 1 THEN 'fallido' ELSE o."estado" END,
    CASE WHEN jsonb_typeof(o."contenido_mensaje" -> 'entrada') = 'object'
        THEN o."contenido_mensaje" #- '{entrada,respuesta_a_id}' ELSE o."contenido_mensaje" END
    || coalesce((
        SELECT jsonb_build_object('propuesta', jsonb_build_object(
                'id', p."propuesta_ia_plantilla_id", 'estructura', p."estructura_propuesta", 'cambios', p."cambios_propuesta",
                'huella_plantilla_base', p."huella_plantilla_base", 'version_borrador', p."version_borrador_propuesta",
                'estado', p."estado_propuesta",
                'creada_en', to_char(p."creada_en" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"'))
            || CASE WHEN p."decidida_por" IS NOT NULL THEN jsonb_build_object('decidida_por', p."decidida_por") ELSE '{}'::jsonb END
            || CASE WHEN p."decidida_en" IS NOT NULL
                THEN jsonb_build_object('decidida_en', to_char(p."decidida_en" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"'))
                ELSE '{}'::jsonb END)
        FROM "propuestas_ia_plantilla" p
        WHERE p."mensaje_ia_plantilla_id" = o."mensaje_ia_plantilla_id"
    ), '{}'::jsonb),
    o."codigo_error",
    CASE WHEN o."rol" = 'usuario' THEN o."clave_idempotencia" END,
    o."completado_en", o."enviado_en", o."actualizado_en"
FROM "ordenado" o;

DO $$
BEGIN
    IF (SELECT count(*) FROM "mensajes_ia" m JOIN "sesiones_ia" s ON s."sesion_ia_id" = m."sesion_ia_id" WHERE s."plantilla_id" IS NOT NULL)
        <> (SELECT count(*) FROM "mensajes_ia_plantilla") THEN
        RAISE EXCEPTION 'No se trasladaron todos los mensajes del asistente de plantilla';
    END IF;
    IF (SELECT count(*) FROM "mensajes_ia" WHERE "contenido_mensaje" ? 'propuesta') <> (SELECT count(*) FROM "propuestas_ia_plantilla") THEN
        RAISE EXCEPTION 'No se trasladaron todas las propuestas del asistente de plantilla';
    END IF;
    IF EXISTS (
        SELECT 1 FROM "propuestas_ia_plantilla" p
        JOIN "mensajes_ia_plantilla" m ON m."mensaje_ia_plantilla_id" = p."mensaje_ia_plantilla_id"
        WHERE p."solicitada_por" <> m."usuario_id" OR p."plantilla_id" <> m."plantilla_id"
    ) THEN
        RAISE EXCEPTION 'Hay propuestas del asistente de plantilla que no son de quien pidió el mensaje';
    END IF;
END $$;

DROP TABLE "propuestas_ia_plantilla";
DROP TABLE "mensajes_ia_plantilla";

COMMIT;
