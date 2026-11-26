CREATE OR REPLACE FUNCTION "comprobar_coordinacion_activa_unica"()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
        IF NEW.asignacion_rol_activa
           AND NEW.carrera_id IS NOT NULL
           AND NEW.rol = 'coordinador' THEN
            PERFORM pg_advisory_xact_lock(hashtextextended('asignaciones_rol:coordinacion:' || NEW.carrera_id::text, 0));
            IF EXISTS (
               SELECT 1
               FROM asignaciones_rol AS existente
               INNER JOIN usuarios AS usuario_existente ON usuario_existente.usuario_id = existente.usuario_id
               WHERE existente.carrera_id = NEW.carrera_id
                 AND existente.asignacion_rol_activa
                 AND usuario_existente.usuario_activo
                 AND existente.rol = 'coordinador'
                 AND existente.asignacion_rol_id <> NEW.asignacion_rol_id
            ) THEN
                RAISE EXCEPTION 'La carrera ya tiene una coordinación activa' USING ERRCODE = '23505';
            END IF;
        END IF;
        RETURN NEW;
    END;
    $function$;

CREATE OR REPLACE FUNCTION "comprobar_administrador_exclusivo"()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
        IF NEW.asignacion_rol_activa THEN
            PERFORM pg_advisory_xact_lock(hashtextextended('asignaciones_rol:usuario:' || NEW.usuario_id::text, 0));
            IF (
                   NEW.rol = 'administrador'
                   AND EXISTS (
                       SELECT 1
                       FROM asignaciones_rol AS existente
                       WHERE existente.usuario_id = NEW.usuario_id
                         AND existente.asignacion_rol_activa
                         AND existente.rol <> 'administrador'
                         AND existente.asignacion_rol_id <> NEW.asignacion_rol_id
                   )
               )
               OR
               (
                   NEW.rol <> 'administrador'
                   AND EXISTS (
                       SELECT 1
                       FROM asignaciones_rol AS existente
                       WHERE existente.usuario_id = NEW.usuario_id
                         AND existente.asignacion_rol_activa
                         AND existente.rol = 'administrador'
                         AND existente.asignacion_rol_id <> NEW.asignacion_rol_id
                   )
               ) THEN
                RAISE EXCEPTION 'El rol Administrador es exclusivo' USING ERRCODE = '23514';
            END IF;
        END IF;
        RETURN NEW;
    END;
    $function$;

CREATE OR REPLACE FUNCTION "marcar_actualizado_en"()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW::text IS DISTINCT FROM OLD::text THEN
        NEW.actualizado_en := now();
    END IF;
    RETURN NEW;
END;
$function$;

ALTER TABLE "asignaturas" ADD COLUMN "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now(), ADD COLUMN "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now();
ALTER TABLE "campos_plantilla" ADD COLUMN "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now(), ADD COLUMN "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now();
ALTER TABLE "carreras" ADD COLUMN "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now(), ADD COLUMN "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now();
ALTER TABLE "convocatorias_carreras" ADD COLUMN "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now(), ADD COLUMN "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now();
ALTER TABLE "convocatorias_universidad" ADD COLUMN "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now(), ADD COLUMN "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now();
ALTER TABLE "definiciones_campo" ADD COLUMN "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now(), ADD COLUMN "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now();
ALTER TABLE "facultades" ADD COLUMN "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now(), ADD COLUMN "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now();
ALTER TABLE "paralelos" ADD COLUMN "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now(), ADD COLUMN "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now();
ALTER TABLE "periodos_academicos" ADD COLUMN "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now(), ADD COLUMN "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now();
ALTER TABLE "plantilla_silabo" ADD COLUMN "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now(), ADD COLUMN "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now();
ALTER TABLE "requisitos_asignatura" ADD COLUMN "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now(), ADD COLUMN "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now();
ALTER TABLE "secciones_plantilla" ADD COLUMN "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now(), ADD COLUMN "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now();
ALTER TABLE "silabos" ADD COLUMN "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now(), ADD COLUMN "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now();
ALTER TABLE "usuarios" ADD COLUMN "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now(), ADD COLUMN "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now();
ALTER TABLE "valores_campo" ADD COLUMN "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now(), ADD COLUMN "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now();
ALTER TABLE "asignaciones_paralelo" ADD COLUMN "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now();
ALTER TABLE "asignaciones_rol" ADD COLUMN "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now();
ALTER TABLE "documentos_apoyo" ADD COLUMN "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now();
ALTER TABLE "exportaciones_silabo" ADD COLUMN "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now();
ALTER TABLE "invitaciones_activacion" ADD COLUMN "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now();
ALTER TABLE "mensajes_ia_plantilla" ADD COLUMN "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now();
ALTER TABLE "notificaciones" ADD COLUMN "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now();
ALTER TABLE "propuestas_ia_plantilla" ADD COLUMN "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now();
ALTER TABLE "ajustes_sistema" ADD COLUMN "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now();

CREATE TRIGGER "marcar_actualizado_en" BEFORE UPDATE ON "asignaciones_paralelo" FOR EACH ROW EXECUTE FUNCTION "marcar_actualizado_en"();
CREATE TRIGGER "marcar_actualizado_en" BEFORE UPDATE ON "asignaciones_rol" FOR EACH ROW EXECUTE FUNCTION "marcar_actualizado_en"();
CREATE TRIGGER "marcar_actualizado_en" BEFORE UPDATE ON "asignaturas" FOR EACH ROW EXECUTE FUNCTION "marcar_actualizado_en"();
CREATE TRIGGER "marcar_actualizado_en" BEFORE UPDATE ON "campos_plantilla" FOR EACH ROW EXECUTE FUNCTION "marcar_actualizado_en"();
CREATE TRIGGER "marcar_actualizado_en" BEFORE UPDATE ON "carreras" FOR EACH ROW EXECUTE FUNCTION "marcar_actualizado_en"();
CREATE TRIGGER "marcar_actualizado_en" BEFORE UPDATE ON "convocatorias_carreras" FOR EACH ROW EXECUTE FUNCTION "marcar_actualizado_en"();
CREATE TRIGGER "marcar_actualizado_en" BEFORE UPDATE ON "convocatorias_universidad" FOR EACH ROW EXECUTE FUNCTION "marcar_actualizado_en"();
CREATE TRIGGER "marcar_actualizado_en" BEFORE UPDATE ON "definiciones_campo" FOR EACH ROW EXECUTE FUNCTION "marcar_actualizado_en"();
CREATE TRIGGER "marcar_actualizado_en" BEFORE UPDATE ON "documentos_apoyo" FOR EACH ROW EXECUTE FUNCTION "marcar_actualizado_en"();
CREATE TRIGGER "marcar_actualizado_en" BEFORE UPDATE ON "exportaciones_silabo" FOR EACH ROW EXECUTE FUNCTION "marcar_actualizado_en"();
CREATE TRIGGER "marcar_actualizado_en" BEFORE UPDATE ON "facultades" FOR EACH ROW EXECUTE FUNCTION "marcar_actualizado_en"();
CREATE TRIGGER "marcar_actualizado_en" BEFORE UPDATE ON "invitaciones_activacion" FOR EACH ROW EXECUTE FUNCTION "marcar_actualizado_en"();
CREATE TRIGGER "marcar_actualizado_en" BEFORE UPDATE ON "mensajes_ia_plantilla" FOR EACH ROW EXECUTE FUNCTION "marcar_actualizado_en"();
CREATE TRIGGER "marcar_actualizado_en" BEFORE UPDATE ON "notificaciones" FOR EACH ROW EXECUTE FUNCTION "marcar_actualizado_en"();
CREATE TRIGGER "marcar_actualizado_en" BEFORE UPDATE ON "paralelos" FOR EACH ROW EXECUTE FUNCTION "marcar_actualizado_en"();
CREATE TRIGGER "marcar_actualizado_en" BEFORE UPDATE ON "periodos_academicos" FOR EACH ROW EXECUTE FUNCTION "marcar_actualizado_en"();
CREATE TRIGGER "marcar_actualizado_en" BEFORE UPDATE ON "plantilla_silabo" FOR EACH ROW EXECUTE FUNCTION "marcar_actualizado_en"();
CREATE TRIGGER "marcar_actualizado_en" BEFORE UPDATE ON "propuestas_ia_plantilla" FOR EACH ROW EXECUTE FUNCTION "marcar_actualizado_en"();
CREATE TRIGGER "marcar_actualizado_en" BEFORE UPDATE ON "requisitos_asignatura" FOR EACH ROW EXECUTE FUNCTION "marcar_actualizado_en"();
CREATE TRIGGER "marcar_actualizado_en" BEFORE UPDATE ON "secciones_plantilla" FOR EACH ROW EXECUTE FUNCTION "marcar_actualizado_en"();
CREATE TRIGGER "marcar_actualizado_en" BEFORE UPDATE ON "silabos" FOR EACH ROW EXECUTE FUNCTION "marcar_actualizado_en"();
CREATE TRIGGER "marcar_actualizado_en" BEFORE UPDATE ON "usuarios" FOR EACH ROW EXECUTE FUNCTION "marcar_actualizado_en"();
CREATE TRIGGER "marcar_actualizado_en" BEFORE UPDATE ON "valores_campo" FOR EACH ROW EXECUTE FUNCTION "marcar_actualizado_en"();
