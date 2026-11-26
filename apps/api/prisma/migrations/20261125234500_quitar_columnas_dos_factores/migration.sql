ALTER TABLE "usuarios" DROP COLUMN IF EXISTS "secreto_dos_factores";
ALTER TABLE "usuarios" DROP COLUMN IF EXISTS "codigos_recuperacion_dos_factores";
ALTER TABLE "usuarios" DROP COLUMN IF EXISTS "dos_factores_confirmado_en";
