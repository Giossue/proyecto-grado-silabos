-- A malla is only 'vigente' or 'cerrada'; the resolution field is removed.
-- One transaction: either every step applies or none does (also when the file is run by hand with psql).
BEGIN;

-- Former 'en_transicion' mallas are closed.
UPDATE "mallas" SET "estado_malla" = 'cerrada' WHERE "estado_malla" = 'en_transicion';

ALTER TABLE "mallas" DROP CONSTRAINT "mallas_estado_check";
ALTER TABLE "mallas" ADD CONSTRAINT "mallas_estado_check" CHECK ("estado_malla" IN ('vigente', 'cerrada'));

ALTER TABLE "mallas" DROP COLUMN "resolucion_malla";

COMMIT;
