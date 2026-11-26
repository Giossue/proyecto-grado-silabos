-- A career can have several curricula (mallas); every subject belongs to one malla.
-- Generic data step: every existing career gets one 'vigente' malla named 'Malla <codigo_carrera>'
-- that takes over the career's numero_ciclos and all of its subjects. No career-specific data.
BEGIN;

CREATE TABLE "mallas" (
    "malla_id" uuid NOT NULL,
    "carrera_id" uuid NOT NULL,
    "nombre_malla" varchar(180) NOT NULL,
    "resolucion_malla" varchar(180),
    "numero_ciclos" smallint NOT NULL,
    "estado_malla" varchar(20) NOT NULL,
    "periodo_academico_inicio_id" uuid,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "mallas_pkey" PRIMARY KEY ("malla_id"),
    CONSTRAINT "mallas_numero_ciclos_check" CHECK (("numero_ciclos" >= 1) AND ("numero_ciclos" <= 30)),
    CONSTRAINT "mallas_estado_check" CHECK ("estado_malla" IN ('vigente', 'en_transicion', 'cerrada')),
    CONSTRAINT "mallas_nombre_check" CHECK (btrim("nombre_malla") <> '')
);

ALTER TABLE "mallas" ADD CONSTRAINT "mallas_carrera_id_fk"
    FOREIGN KEY ("carrera_id") REFERENCES "carreras"("carrera_id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "mallas" ADD CONSTRAINT "mallas_periodo_academico_inicio_id_fk"
    FOREIGN KEY ("periodo_academico_inicio_id") REFERENCES "periodos_academicos"("periodo_academico_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

CREATE UNIQUE INDEX "mallas_malla_id_carrera_id_unica" ON "mallas"("malla_id", "carrera_id");
CREATE UNIQUE INDEX "mallas_carrera_id_nombre_malla_unica" ON "mallas"("carrera_id", "nombre_malla");
CREATE UNIQUE INDEX "mallas_carrera_id_vigente_unica" ON "mallas"("carrera_id") WHERE ("estado_malla" = 'vigente');
CREATE INDEX "mallas_periodo_academico_inicio_id_idx" ON "mallas"("periodo_academico_inicio_id");

CREATE TRIGGER "marcar_actualizado_en" BEFORE UPDATE ON "mallas" FOR EACH ROW EXECUTE FUNCTION "marcar_actualizado_en"();

-- One 'vigente' malla per existing career, carrying the career's cycles.
INSERT INTO "mallas" ("malla_id", "carrera_id", "nombre_malla", "numero_ciclos", "estado_malla", "creado_en", "actualizado_en")
SELECT gen_random_uuid(), "carrera_id", 'Malla ' || "codigo_carrera", "numero_ciclos", 'vigente', "creado_en", "creado_en"
FROM "carreras";

-- Attach every subject to its career's malla without touching actualizado_en.
ALTER TABLE "asignaturas" ADD COLUMN "malla_id" uuid;

ALTER TABLE "asignaturas" DISABLE TRIGGER "marcar_actualizado_en";

UPDATE "asignaturas" AS a
SET "malla_id" = m."malla_id"
FROM "mallas" AS m
WHERE m."carrera_id" = a."carrera_id";

ALTER TABLE "asignaturas" ENABLE TRIGGER "marcar_actualizado_en";

ALTER TABLE "asignaturas" ALTER COLUMN "malla_id" SET NOT NULL;

-- asignaturas.carrera_id stays as a denormalized copy kept consistent by the composite FK;
-- ON UPDATE CASCADE lets a malla move to another career (career merge) carrying its subjects.
ALTER TABLE "asignaturas" ADD CONSTRAINT "asignaturas_malla_id_carrera_id_fk"
    FOREIGN KEY ("malla_id", "carrera_id") REFERENCES "mallas"("malla_id", "carrera_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "asignaturas" DROP CONSTRAINT "asignaturas_carrera_id_codigo_asignatura_unica";
CREATE UNIQUE INDEX "asignaturas_malla_id_codigo_asignatura_unica" ON "asignaturas"("malla_id", "codigo_asignatura");
CREATE INDEX "asignaturas_carrera_id_idx" ON "asignaturas"("carrera_id");

-- The number of cycles now belongs to the malla.
ALTER TABLE "carreras" DROP CONSTRAINT "carreras_numero_ciclos_check";
ALTER TABLE "carreras" DROP COLUMN "numero_ciclos";

COMMIT;
