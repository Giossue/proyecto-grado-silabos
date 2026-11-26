-- Corequisites are no longer modeled: the university only records prerequisites.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'requisitos_asignatura' AND column_name = 'tipo_requisito_asignatura') THEN
    DELETE FROM "requisitos_asignatura" WHERE "tipo_requisito_asignatura" = 'correquisito';
  END IF;
END $$;
ALTER TABLE "requisitos_asignatura" DROP CONSTRAINT IF EXISTS "requisitos_asignatura_tipo_check";
ALTER TABLE "requisitos_asignatura" DROP COLUMN IF EXISTS "tipo_requisito_asignatura";

-- A faculty can exist on several campuses, so the campus is no longer stored with it.
ALTER TABLE "facultades" DROP CONSTRAINT IF EXISTS "facultades_campus_facultad_check";
ALTER TABLE "facultades" DROP COLUMN IF EXISTS "campus_facultad";
