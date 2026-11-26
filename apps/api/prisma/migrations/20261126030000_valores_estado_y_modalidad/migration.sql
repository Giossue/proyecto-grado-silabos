ALTER TABLE "convocatorias_carreras" DROP CONSTRAINT "convocatorias_carreras_estado_check";
ALTER TABLE "convocatorias_carreras" DROP CONSTRAINT "convocatorias_carreras_estado_previo_cierre_check";

ALTER TABLE "convocatorias_carreras" DISABLE TRIGGER "marcar_actualizado_en";

UPDATE "convocatorias_carreras"
SET "estado_convocatoria_carrera" = CASE "estado_convocatoria_carrera"
        WHEN 'abierta' THEN 'abierto'
        WHEN 'pausada' THEN 'pausado'
        WHEN 'cerrada' THEN 'cerrado'
        ELSE "estado_convocatoria_carrera"
    END,
    "estado_previo_cierre_convocatoria_carrera" = CASE "estado_previo_cierre_convocatoria_carrera"
        WHEN 'abierta' THEN 'abierto'
        WHEN 'pausada' THEN 'pausado'
        ELSE "estado_previo_cierre_convocatoria_carrera"
    END
WHERE "estado_convocatoria_carrera" IN ('abierta', 'pausada', 'cerrada')
    OR "estado_previo_cierre_convocatoria_carrera" IN ('abierta', 'pausada');

ALTER TABLE "convocatorias_carreras" ENABLE TRIGGER "marcar_actualizado_en";

ALTER TABLE "convocatorias_carreras" ADD CONSTRAINT "convocatorias_carreras_estado_check"
    CHECK ("estado_convocatoria_carrera" IN ('preparacion', 'abierto', 'pausado', 'cerrado'));
ALTER TABLE "convocatorias_carreras" ADD CONSTRAINT "convocatorias_carreras_estado_previo_cierre_check"
    CHECK ("estado_previo_cierre_convocatoria_carrera" IS NULL
        OR ("estado_convocatoria_carrera" = 'cerrado' AND "estado_previo_cierre_convocatoria_carrera" IN ('abierto', 'pausado')));

ALTER TABLE "carreras" ALTER COLUMN "modalidad_carrera" TYPE varchar(20) USING (CASE "modalidad_carrera"::text
    WHEN 'Presencial' THEN 'presencial'
    WHEN 'Semipresencial' THEN 'semipresencial'
    WHEN 'En línea' THEN 'en_linea'
    WHEN 'A distancia' THEN 'a_distancia'
    WHEN 'Híbrida' THEN 'hibrida'
    ELSE "modalidad_carrera"::text
END);

ALTER TABLE "asignaturas" ALTER COLUMN "modalidad_asignatura" TYPE varchar(20) USING (CASE "modalidad_asignatura"::text
    WHEN 'Presencial' THEN 'presencial'
    WHEN 'Semipresencial' THEN 'semipresencial'
    WHEN 'En línea' THEN 'en_linea'
    WHEN 'A distancia' THEN 'a_distancia'
    WHEN 'Híbrida' THEN 'hibrida'
    ELSE "modalidad_asignatura"::text
END);

ALTER TABLE "carreras" ADD CONSTRAINT "carreras_modalidad_check"
    CHECK ("modalidad_carrera" IN ('presencial', 'semipresencial', 'en_linea', 'a_distancia', 'hibrida'));
ALTER TABLE "asignaturas" ADD CONSTRAINT "asignaturas_modalidad_check"
    CHECK ("modalidad_asignatura" IN ('presencial', 'semipresencial', 'en_linea', 'a_distancia', 'hibrida'));

DROP TYPE "modalidad_estudio";
