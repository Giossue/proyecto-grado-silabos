BEGIN;

CREATE TABLE "permisos_lectura_ia" (
    "plantilla_id" uuid NOT NULL,
    "clave_campo_plantilla" varchar(120) NOT NULL,
    "lectura_permitida" boolean NOT NULL,
    "modificado_por" uuid,
    "creado_en" timestamptz(6) NOT NULL DEFAULT now(),
    "actualizado_en" timestamptz(6) NOT NULL DEFAULT now(),
    CONSTRAINT "permisos_lectura_ia_pkey" PRIMARY KEY ("plantilla_id", "clave_campo_plantilla"),
    CONSTRAINT "permisos_lectura_ia_plantilla_id_fk" FOREIGN KEY ("plantilla_id") REFERENCES "plantilla_silabo" ("plantilla_id") ON DELETE CASCADE,
    CONSTRAINT "permisos_lectura_ia_modificado_por_fk" FOREIGN KEY ("modificado_por") REFERENCES "usuarios" ("usuario_id") ON DELETE SET NULL
);

CREATE INDEX "permisos_lectura_ia_modificado_por_idx" ON "permisos_lectura_ia" ("modificado_por");

CREATE TRIGGER "marcar_actualizado_en" BEFORE UPDATE ON "permisos_lectura_ia" FOR EACH ROW EXECUTE FUNCTION "marcar_actualizado_en"();

INSERT INTO "permisos_lectura_ia" ("plantilla_id", "clave_campo_plantilla", "lectura_permitida")
SELECT c."plantilla_id", c."clave_campo_plantilla", true
FROM "campos_plantilla" c
JOIN "secciones_plantilla" s ON s."seccion_plantilla_id" = c."seccion_plantilla_id" AND s."vigente_en_plantilla"
JOIN "definiciones_campo" d ON d."campo_plantilla_id" = c."campo_plantilla_id" AND d."vigente_en_plantilla"
JOIN "plantilla_silabo" p ON p."plantilla_id" = c."plantilla_id"
WHERE c."vigente_en_plantilla"
    AND d."quien_llena_definicion_campo" <> 'institucional'
    AND c."clave_campo_plantilla" <> 'formacion_docente'
    AND NOT EXISTS (
        SELECT 1
        FROM jsonb_path_query(d."contenido_definicion_campo", 'strict $.** ? (@.type == "documentBlock")') AS bloque
        WHERE bloque #>> '{attrs,kind}' = 'identificacion'
            OR jsonb_path_exists(bloque, 'strict $.attrs.value.disability', silent => true)
            OR coalesce((p."definicion_plantilla"::jsonb #> ARRAY['blocks', bloque #>> '{attrs,kind}', 'value'])::text, '') ~* 'disabilit|discapacidad'
    );

COMMIT;
