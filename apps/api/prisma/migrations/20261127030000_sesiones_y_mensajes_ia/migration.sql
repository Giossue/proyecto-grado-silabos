BEGIN;

CREATE TABLE "sesiones_ia" (
    "sesion_ia_id" uuid NOT NULL,
    "usuario_id" uuid NOT NULL,
    "silabo_id" uuid,
    "plantilla_id" uuid,
    "cerrada_en" timestamptz(6),
    "creado_en" timestamptz(6) NOT NULL DEFAULT now(),
    "actualizado_en" timestamptz(6) NOT NULL DEFAULT now(),
    CONSTRAINT "sesiones_ia_pkey" PRIMARY KEY ("sesion_ia_id"),
    CONSTRAINT "sesiones_ia_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "usuarios" ("usuario_id") ON DELETE CASCADE,
    CONSTRAINT "sesiones_ia_silabo_id_fk" FOREIGN KEY ("silabo_id") REFERENCES "silabos" ("silabo_id") ON DELETE CASCADE,
    CONSTRAINT "sesiones_ia_plantilla_id_fk" FOREIGN KEY ("plantilla_id") REFERENCES "plantilla_silabo" ("plantilla_id") ON DELETE CASCADE,
    CONSTRAINT "sesiones_ia_asunto_check" CHECK (num_nonnulls("silabo_id", "plantilla_id") = 1)
);

CREATE UNIQUE INDEX "sesiones_ia_silabo_abierta_unica" ON "sesiones_ia" ("usuario_id", "silabo_id") WHERE "cerrada_en" IS NULL;
CREATE UNIQUE INDEX "sesiones_ia_plantilla_abierta_unica" ON "sesiones_ia" ("usuario_id", "plantilla_id") WHERE "cerrada_en" IS NULL;
CREATE INDEX "sesiones_ia_usuario_id_idx" ON "sesiones_ia" ("usuario_id");
CREATE INDEX "sesiones_ia_silabo_id_idx" ON "sesiones_ia" ("silabo_id");
CREATE INDEX "sesiones_ia_plantilla_id_idx" ON "sesiones_ia" ("plantilla_id");

CREATE TABLE "mensajes_ia" (
    "mensaje_ia_id" uuid NOT NULL,
    "sesion_ia_id" uuid NOT NULL,
    "respuesta_a_id" uuid,
    "rol" varchar(20) NOT NULL,
    "estado" varchar(20) NOT NULL,
    "contenido_mensaje" jsonb NOT NULL,
    "codigo_error" text,
    "clave_idempotencia" varchar(100),
    "completado_en" timestamptz(6),
    "creado_en" timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
    "actualizado_en" timestamptz(6) NOT NULL DEFAULT now(),
    CONSTRAINT "mensajes_ia_pkey" PRIMARY KEY ("mensaje_ia_id"),
    CONSTRAINT "mensajes_ia_sesion_ia_id_fk" FOREIGN KEY ("sesion_ia_id") REFERENCES "sesiones_ia" ("sesion_ia_id") ON DELETE CASCADE,
    CONSTRAINT "mensajes_ia_respuesta_a_id_fk" FOREIGN KEY ("respuesta_a_id") REFERENCES "mensajes_ia" ("mensaje_ia_id") ON DELETE CASCADE,
    CONSTRAINT "mensajes_ia_rol_check" CHECK ("rol" IN ('usuario', 'asistente')),
    CONSTRAINT "mensajes_ia_estado_check" CHECK ("estado" IN ('pendiente', 'en_ejecucion', 'completado', 'fallido')),
    CONSTRAINT "mensajes_ia_contenido_check" CHECK (
        jsonb_typeof("contenido_mensaje") = 'object'
        AND NOT ("contenido_mensaje" ?| ARRAY['rol', 'estado', 'codigo_error', 'completado_en'])
        AND NOT coalesce(("contenido_mensaje" -> 'entrada') ?| ARRAY['clave_idempotencia', 'respuesta_a_id'], false)
    ),
    CONSTRAINT "mensajes_ia_forma_check" CHECK (
        ("rol" = 'usuario' AND "estado" = 'completado' AND "respuesta_a_id" IS NULL)
        OR ("rol" = 'asistente' AND "clave_idempotencia" IS NULL)
    )
);

CREATE UNIQUE INDEX "mensajes_ia_respuesta_a_id_unica" ON "mensajes_ia" ("respuesta_a_id");
CREATE UNIQUE INDEX "mensajes_ia_idempotencia_unica" ON "mensajes_ia" ("sesion_ia_id", "clave_idempotencia") WHERE "clave_idempotencia" IS NOT NULL;
CREATE UNIQUE INDEX "mensajes_ia_pedido_abierto_unica" ON "mensajes_ia" ("sesion_ia_id") WHERE "estado" IN ('pendiente', 'en_ejecucion');
CREATE INDEX "mensajes_ia_sesion_ia_id_creado_en_idx" ON "mensajes_ia" ("sesion_ia_id", "creado_en");

INSERT INTO "sesiones_ia" ("sesion_ia_id", "usuario_id", "silabo_id", "creado_en", "actualizado_en")
SELECT gen_random_uuid(), "usuario_id", "silabo_id", min("creado_en"), max("actualizado_en")
FROM "mensajes_ia_docente"
GROUP BY "usuario_id", "silabo_id";

INSERT INTO "mensajes_ia" ("mensaje_ia_id", "sesion_ia_id", "respuesta_a_id", "rol", "estado", "contenido_mensaje", "codigo_error",
    "clave_idempotencia", "completado_en", "creado_en", "actualizado_en")
SELECT m."mensaje_ia_docente_id", s."sesion_ia_id", m."respuesta_a_id", m."rol", m."estado",
    m."contenido_mensaje"
    || CASE WHEN cardinality(m."campos_enviados") > 0 THEN jsonb_build_object('campos_enviados', to_jsonb(m."campos_enviados")) ELSE '{}'::jsonb END
    || coalesce((
        SELECT jsonb_build_object('propuestas', jsonb_agg(
            jsonb_build_object('id', p."propuesta_ia_docente_id", 'campo_id', p."definicion_campo_id", 'destino', p."destino_propuesta",
                'texto', p."texto_propuesta", 'fundamento', p."fundamento_propuesta")
            || CASE WHEN p."estado_propuesta" IN ('aceptada', 'descartada') THEN jsonb_build_object('estado', p."estado_propuesta") ELSE '{}'::jsonb END
            ORDER BY p."posicion_propuesta"))
        FROM "propuestas_ia_docente" p
        WHERE p."mensaje_ia_docente_id" = m."mensaje_ia_docente_id"
        HAVING count(*) > 0
    ), '{}'::jsonb),
    m."codigo_error", m."clave_idempotencia", m."completado_en", m."creado_en", m."actualizado_en"
FROM "mensajes_ia_docente" m
JOIN "sesiones_ia" s ON s."usuario_id" = m."usuario_id" AND s."silabo_id" = m."silabo_id";

DO $$
BEGIN
    IF (SELECT count(*) FROM "mensajes_ia") <> (SELECT count(*) FROM "mensajes_ia_docente") THEN
        RAISE EXCEPTION 'No se trasladaron todos los mensajes del asistente del docente';
    END IF;
    IF (SELECT coalesce(sum(jsonb_array_length("contenido_mensaje" -> 'propuestas')), 0) FROM "mensajes_ia" WHERE "contenido_mensaje" ? 'propuestas')
        <> (SELECT count(*) FROM "propuestas_ia_docente") THEN
        RAISE EXCEPTION 'No se trasladaron todas las propuestas del asistente del docente';
    END IF;
END $$;

CREATE TRIGGER "marcar_actualizado_en" BEFORE UPDATE ON "sesiones_ia" FOR EACH ROW EXECUTE FUNCTION "marcar_actualizado_en"();
CREATE TRIGGER "marcar_actualizado_en" BEFORE UPDATE ON "mensajes_ia" FOR EACH ROW EXECUTE FUNCTION "marcar_actualizado_en"();

DROP TABLE "propuestas_ia_docente";
DROP TABLE "mensajes_ia_docente";

COMMIT;
