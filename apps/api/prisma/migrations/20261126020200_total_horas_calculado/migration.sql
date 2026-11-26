DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "asignaturas"
        WHERE "total_horas_asignatura" IS DISTINCT FROM round(coalesce("horas_docencia", 0) + coalesce("horas_practicas", 0) + coalesce("horas_autonomas", 0))::smallint
    ) THEN
        RAISE EXCEPTION 'asignaturas has a stored total that differs from the sum of its hours';
    END IF;
END;
$$;

ALTER TABLE "asignaturas" DROP COLUMN "total_horas_asignatura";
