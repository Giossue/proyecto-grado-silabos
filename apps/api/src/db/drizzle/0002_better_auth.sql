CREATE TABLE "cuentas_usuario" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dos_factores_usuario" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" uuid NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"failed_verification_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sesiones_usuario" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"active_role_assignment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verificaciones_usuario" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cuentas_usuario" ADD CONSTRAINT "cuentas_usuario_user_id_usuarios_usuario_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("usuario_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dos_factores_usuario" ADD CONSTRAINT "dos_factores_usuario_user_id_usuarios_usuario_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("usuario_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones_usuario" ADD CONSTRAINT "sesiones_usuario_user_id_usuarios_usuario_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("usuario_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones_usuario" ADD CONSTRAINT "sesiones_usuario_active_role_assignment_id_asignaciones_rol_asignacion_rol_id_fk" FOREIGN KEY ("active_role_assignment_id") REFERENCES "public"."asignaciones_rol"("asignacion_rol_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cuentas_usuario_provider_account_unique" ON "cuentas_usuario" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "cuentas_usuario_user_id_index" ON "cuentas_usuario" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dos_factores_usuario_user_id_unique" ON "dos_factores_usuario" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sesiones_usuario_token_unique" ON "sesiones_usuario" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sesiones_usuario_user_id_index" ON "sesiones_usuario" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verificaciones_usuario_identifier_index" ON "verificaciones_usuario" USING btree ("identifier");--> statement-breakpoint
INSERT INTO "cuentas_usuario" ("id", "account_id", "provider_id", "user_id", "password") SELECT gen_random_uuid()::text, "usuario_id"::text, 'credential', "usuario_id", "contrasena" FROM "usuarios" ON CONFLICT ("provider_id", "account_id") DO NOTHING;
