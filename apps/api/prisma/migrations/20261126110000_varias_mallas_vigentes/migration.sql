-- A career may have several 'vigente' mallas at once: the one-vigente-per-career rule is dropped.
-- One transaction: either every step applies or none does (also when the file is run by hand with psql).
BEGIN;

DROP INDEX IF EXISTS "mallas_carrera_id_vigente_unica";

COMMIT;
