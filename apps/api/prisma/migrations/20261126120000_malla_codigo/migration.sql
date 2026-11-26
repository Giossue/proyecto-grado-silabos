-- A malla is identified by a code, unique in its career, not by a name: nombre_malla becomes codigo_malla.
-- Existing values drop their leading 'Malla ' ('Malla SW-8' -> 'SW-8'); screens show 'Malla <código>'.
-- The column takes the type of carreras.codigo_carrera (varchar(80)): a value that does not fit, or two
-- mallas of one career ending with the same code, make the migration fail and nothing changes.
-- One transaction: either every step applies or none does (also when the file is run by hand with psql).
BEGIN;

ALTER TABLE "mallas" RENAME COLUMN "nombre_malla" TO "codigo_malla";

-- Rebuilt after the rewrite below so that a value moving onto another one's old value
-- ('Malla A' -> 'A' while 'Malla Malla A' -> 'Malla A') is never a false duplicate mid-update.
DROP INDEX "mallas_carrera_id_nombre_malla_unica";

-- Same malla, new identifier: keep actualizado_en.
ALTER TABLE "mallas" DISABLE TRIGGER "marcar_actualizado_en";

UPDATE "mallas"
SET "codigo_malla" = btrim(substr("codigo_malla", length('Malla ') + 1))
WHERE "codigo_malla" LIKE 'Malla %'
  AND btrim(substr("codigo_malla", length('Malla ') + 1)) <> '';

ALTER TABLE "mallas" ENABLE TRIGGER "marcar_actualizado_en";

ALTER TABLE "mallas" ALTER COLUMN "codigo_malla" TYPE varchar(80);

CREATE UNIQUE INDEX "mallas_carrera_id_codigo_malla_unica" ON "mallas"("carrera_id", "codigo_malla");

ALTER TABLE "mallas" RENAME CONSTRAINT "mallas_nombre_check" TO "mallas_codigo_check";

COMMIT;
