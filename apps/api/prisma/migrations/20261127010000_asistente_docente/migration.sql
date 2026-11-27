BEGIN;

CREATE TABLE "mensajes_ia_docente" (
    "mensaje_ia_docente_id" uuid NOT NULL,
    "silabo_id" uuid NOT NULL,
    "usuario_id" uuid NOT NULL,
    "respuesta_a_id" uuid,
    "rol" varchar(20) NOT NULL,
    "estado" varchar(20) NOT NULL,
    "contenido_mensaje" jsonb NOT NULL,
    "campos_enviados" uuid[] NOT NULL DEFAULT '{}',
    "codigo_error" varchar(60),
    "clave_idempotencia" varchar(100),
    "completado_en" timestamptz(6),
    "creado_en" timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
    "actualizado_en" timestamptz(6) NOT NULL DEFAULT now(),
    CONSTRAINT "mensajes_ia_docente_pkey" PRIMARY KEY ("mensaje_ia_docente_id"),
    CONSTRAINT "mensajes_ia_docente_silabo_id_fk" FOREIGN KEY ("silabo_id") REFERENCES "silabos" ("silabo_id") ON DELETE CASCADE,
    CONSTRAINT "mensajes_ia_docente_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "usuarios" ("usuario_id") ON DELETE CASCADE,
    CONSTRAINT "mensajes_ia_docente_respuesta_a_id_fk" FOREIGN KEY ("respuesta_a_id") REFERENCES "mensajes_ia_docente" ("mensaje_ia_docente_id") ON DELETE CASCADE,
    CONSTRAINT "mensajes_ia_docente_rol_check" CHECK ("rol" IN ('usuario', 'asistente')),
    CONSTRAINT "mensajes_ia_docente_estado_check" CHECK ("estado" IN ('pendiente', 'en_ejecucion', 'completado', 'fallido')),
    CONSTRAINT "mensajes_ia_docente_contenido_check" CHECK (jsonb_typeof("contenido_mensaje") = 'object'),
    CONSTRAINT "mensajes_ia_docente_forma_check" CHECK (
        ("rol" = 'usuario' AND "estado" = 'completado' AND "respuesta_a_id" IS NULL AND "clave_idempotencia" IS NOT NULL)
        OR ("rol" = 'asistente' AND "respuesta_a_id" IS NOT NULL AND "clave_idempotencia" IS NULL)
    )
);

CREATE UNIQUE INDEX "mensajes_ia_docente_respuesta_a_id_unica" ON "mensajes_ia_docente" ("respuesta_a_id");
CREATE UNIQUE INDEX "mensajes_ia_docente_idempotencia_unica" ON "mensajes_ia_docente" ("silabo_id", "usuario_id", "clave_idempotencia") WHERE "clave_idempotencia" IS NOT NULL;
CREATE UNIQUE INDEX "mensajes_ia_docente_pedido_abierto_unica" ON "mensajes_ia_docente" ("silabo_id", "usuario_id") WHERE "estado" IN ('pendiente', 'en_ejecucion');
CREATE INDEX "mensajes_ia_docente_silabo_id_usuario_id_creado_en_idx" ON "mensajes_ia_docente" ("silabo_id", "usuario_id", "creado_en");
CREATE INDEX "mensajes_ia_docente_usuario_id_idx" ON "mensajes_ia_docente" ("usuario_id");

CREATE TRIGGER "marcar_actualizado_en" BEFORE UPDATE ON "mensajes_ia_docente" FOR EACH ROW EXECUTE FUNCTION "marcar_actualizado_en"();

CREATE TABLE "propuestas_ia_docente" (
    "propuesta_ia_docente_id" uuid NOT NULL,
    "mensaje_ia_docente_id" uuid NOT NULL,
    "definicion_campo_id" uuid NOT NULL,
    "posicion_propuesta" smallint NOT NULL,
    "destino_propuesta" jsonb NOT NULL,
    "huella_destino_base" char(64) NOT NULL,
    "texto_propuesta" text NOT NULL,
    "fundamento_propuesta" text NOT NULL,
    "estado_propuesta" varchar(20) NOT NULL DEFAULT 'pendiente',
    "decidida_en" timestamptz(6),
    "creado_en" timestamptz(6) NOT NULL DEFAULT now(),
    "actualizado_en" timestamptz(6) NOT NULL DEFAULT now(),
    CONSTRAINT "propuestas_ia_docente_pkey" PRIMARY KEY ("propuesta_ia_docente_id"),
    CONSTRAINT "propuestas_ia_docente_mensaje_ia_docente_id_fk" FOREIGN KEY ("mensaje_ia_docente_id") REFERENCES "mensajes_ia_docente" ("mensaje_ia_docente_id") ON DELETE CASCADE,
    CONSTRAINT "propuestas_ia_docente_definicion_campo_id_fk" FOREIGN KEY ("definicion_campo_id") REFERENCES "definiciones_campo" ("definicion_campo_id") ON DELETE CASCADE,
    CONSTRAINT "propuestas_ia_docente_estado_check" CHECK ("estado_propuesta" IN ('pendiente', 'aceptada', 'descartada', 'reemplazada')),
    CONSTRAINT "propuestas_ia_docente_destino_check" CHECK (jsonb_typeof("destino_propuesta") = 'object')
);

CREATE UNIQUE INDEX "propuestas_ia_docente_mensaje_posicion_unica" ON "propuestas_ia_docente" ("mensaje_ia_docente_id", "posicion_propuesta");
CREATE INDEX "propuestas_ia_docente_definicion_campo_id_idx" ON "propuestas_ia_docente" ("definicion_campo_id");

CREATE TRIGGER "marcar_actualizado_en" BEFORE UPDATE ON "propuestas_ia_docente" FOR EACH ROW EXECUTE FUNCTION "marcar_actualizado_en"();

COMMIT;
