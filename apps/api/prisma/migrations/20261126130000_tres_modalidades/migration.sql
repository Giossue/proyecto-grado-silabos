-- Only three study modalities remain: presencial, hibrida and en_linea.
-- No stored row is rewritten: a career or subject still using a removed value makes the migration fail
-- and nothing changes.
-- One transaction: either every step applies or none does (also when the file is run by hand with psql).
BEGIN;

ALTER TABLE "carreras"
    DROP CONSTRAINT "carreras_modalidad_check",
    ADD CONSTRAINT "carreras_modalidad_check" CHECK ("modalidad_carrera" IN ('presencial', 'hibrida', 'en_linea'));

ALTER TABLE "asignaturas"
    DROP CONSTRAINT "asignaturas_modalidad_check",
    ADD CONSTRAINT "asignaturas_modalidad_check" CHECK ("modalidad_asignatura" IN ('presencial', 'hibrida', 'en_linea'));

COMMIT;
