DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "usuarios" AS usuario
        WHERE NOT EXISTS (
            SELECT 1
            FROM "cuentas_usuario" AS cuenta
            WHERE cuenta."user_id" = usuario."usuario_id"
              AND cuenta."provider_id" = 'credential'
              AND cuenta."password" IS NOT NULL
        )
    ) THEN
        RAISE EXCEPTION 'usuarios has users without a credential account with a password';
    END IF;
END;
$$;

ALTER TABLE "usuarios" DROP COLUMN "contrasena";
