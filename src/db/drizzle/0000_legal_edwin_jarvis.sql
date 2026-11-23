-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TYPE "public"."modalidad_estudio" AS ENUM('Presencial', 'Semipresencial', 'En línea', 'A distancia', 'Híbrida');--> statement-breakpoint
CREATE TABLE "documentos_apoyo" (
	"documento_apoyo_id" uuid PRIMARY KEY NOT NULL,
	"carrera_id" uuid NOT NULL,
	"titulo_documento" varchar(180) NOT NULL,
	"archivo_id" uuid NOT NULL,
	"archivo_vista_id" uuid,
	"estado_vista" varchar(20) DEFAULT 'pendiente' NOT NULL,
	"subido_por" uuid NOT NULL,
	"subido_en" timestamp(0) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "documentos_apoyo_archivo_id_unique" UNIQUE("archivo_id"),
	CONSTRAINT "documentos_apoyo_estado_vista_check" CHECK ((estado_vista)::text = ANY (ARRAY[('pendiente'::character varying)::text, ('lista'::character varying)::text, ('sin_vista'::character varying)::text])),
	CONSTRAINT "documentos_apoyo_titulo_check" CHECK (btrim((titulo_documento)::text) <> ''::text),
	CONSTRAINT "documentos_apoyo_vista_check" CHECK (((estado_vista)::text <> 'lista'::text) OR (archivo_vista_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "asignaciones_paralelo" (
	"asignacion_paralelo_id" uuid PRIMARY KEY NOT NULL,
	"paralelo_id" uuid NOT NULL,
	"asignacion_paralelo_activa" boolean DEFAULT true NOT NULL,
	"asignado_en" timestamp(0) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"asignacion_rol_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "envios_biblioteca" (
	"envio_biblioteca_id" uuid PRIMARY KEY NOT NULL,
	"revision_silabo_id" uuid NOT NULL,
	"verificado_por" uuid,
	"verificado_en" timestamp with time zone,
	"verificacion_heredada" boolean DEFAULT false NOT NULL,
	CONSTRAINT "envios_biblioteca_revision_unica" UNIQUE("revision_silabo_id"),
	CONSTRAINT "envios_biblioteca_herencia_verificada" CHECK ((NOT verificacion_heredada) OR (verificado_en IS NOT NULL)),
	CONSTRAINT "envios_biblioteca_verificacion_completa" CHECK ((verificado_por IS NULL) = (verificado_en IS NULL))
);
--> statement-breakpoint
CREATE TABLE "convocatorias_universidad" (
	"convocatoria_universidad_id" uuid PRIMARY KEY NOT NULL,
	"fecha_inicio" timestamp(0) with time zone NOT NULL,
	"fecha_entrega" timestamp(0) with time zone NOT NULL,
	"estado_convocatoria_universidad" varchar(20) DEFAULT 'abierto' NOT NULL,
	"periodo_academico_id" uuid NOT NULL,
	"pausado_en" timestamp(6) with time zone,
	"cantidad_prorrogas" integer DEFAULT 0 NOT NULL,
	"finalizada_en" timestamp(6) with time zone,
	CONSTRAINT "convocatorias_universidad_cantidad_prorrogas_check" CHECK (cantidad_prorrogas >= 0),
	CONSTRAINT "convocatorias_universidad_estado_check" CHECK ((estado_convocatoria_universidad)::text = ANY (ARRAY[('abierto'::character varying)::text, ('pausado'::character varying)::text, ('cerrado'::character varying)::text])),
	CONSTRAINT "convocatorias_universidad_fechas_check" CHECK (fecha_entrega > fecha_inicio),
	CONSTRAINT "convocatorias_universidad_finalizada_en_check" CHECK ((finalizada_en IS NULL) OR ((estado_convocatoria_universidad)::text = 'cerrado'::text))
);
--> statement-breakpoint
CREATE TABLE "convocatorias_carreras" (
	"convocatoria_carrera_id" uuid PRIMARY KEY NOT NULL,
	"carrera_id" uuid NOT NULL,
	"estado_convocatoria_carrera" varchar(24) DEFAULT 'preparacion' NOT NULL,
	"convocatoria_universidad_id" uuid NOT NULL,
	"estado_previo_cierre_convocatoria_carrera" varchar(24),
	CONSTRAINT "convocatorias_carreras_estado_check" CHECK ((estado_convocatoria_carrera)::text = ANY (ARRAY[('preparacion'::character varying)::text, ('abierta'::character varying)::text, ('pausada'::character varying)::text, ('cerrada'::character varying)::text])),
	CONSTRAINT "convocatorias_carreras_estado_previo_cierre_check" CHECK ((estado_previo_cierre_convocatoria_carrera IS NULL) OR (((estado_convocatoria_carrera)::text = 'cerrada'::text) AND ((estado_previo_cierre_convocatoria_carrera)::text = ANY (ARRAY[('abierta'::character varying)::text, ('pausada'::character varying)::text]))))
);
--> statement-breakpoint
CREATE TABLE "bloqueos_temporales" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"owner" varchar(255) NOT NULL,
	"expiration" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asignaturas" (
	"asignatura_id" uuid PRIMARY KEY NOT NULL,
	"codigo_asignatura" varchar(80) NOT NULL,
	"nombre_asignatura" varchar(180) NOT NULL,
	"ciclo_asignatura" smallint,
	"creditos_asignatura" numeric(6, 2),
	"asignatura_activa" boolean DEFAULT true NOT NULL,
	"horas_docencia" numeric(6, 2),
	"horas_practicas" numeric(6, 2),
	"horas_autonomas" numeric(6, 2),
	"orden_asignatura_en_ciclo" smallint DEFAULT '0' NOT NULL,
	"unidad_curricular_asignatura" varchar(30),
	"modalidad_asignatura" "modalidad_estudio",
	"carrera_id" uuid NOT NULL,
	"total_horas_asignatura" smallint GENERATED ALWAYS AS ((round(((COALESCE(horas_docencia, (0)::numeric) + COALESCE(horas_practicas, (0)::numeric)) + COALESCE(horas_autonomas, (0)::numeric))))::smallint) STORED,
	"genera_silabo_asignatura" boolean DEFAULT true NOT NULL,
	CONSTRAINT "asignaturas_carrera_id_codigo_asignatura_unique" UNIQUE("carrera_id","codigo_asignatura"),
	CONSTRAINT "asignaturas_identidad_carrera_unica" UNIQUE("asignatura_id","carrera_id"),
	CONSTRAINT "asignaturas_unidad_curricular_check" CHECK ((unidad_curricular_asignatura)::text = ANY (ARRAY[('basica'::character varying)::text, ('profesional'::character varying)::text, ('integracion_curricular'::character varying)::text]))
);
--> statement-breakpoint
CREATE TABLE "cola_trabajos" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"queue" varchar(255) NOT NULL,
	"payload" text NOT NULL,
	"attempts" smallint NOT NULL,
	"reserved_at" integer,
	"available_at" integer NOT NULL,
	"created_at" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campos_plantilla" (
	"campo_plantilla_id" uuid PRIMARY KEY NOT NULL,
	"seccion_plantilla_id" uuid NOT NULL,
	"plantilla_id" uuid NOT NULL,
	"clave_campo_plantilla" varchar(120) NOT NULL,
	"titulo_campo_plantilla" varchar(180) DEFAULT '' NOT NULL,
	"posicion_campo_plantilla" smallint NOT NULL,
	"vigente_en_plantilla" boolean DEFAULT true NOT NULL,
	CONSTRAINT "campos_plantilla_id_plantilla_unica" UNIQUE("campo_plantilla_id","plantilla_id")
);
--> statement-breakpoint
CREATE TABLE "datos_temporales" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"expiration" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aprobaciones" (
	"aprobacion_id" uuid PRIMARY KEY NOT NULL,
	"revision_silabo_id" uuid NOT NULL,
	"clave_solicitud" uuid NOT NULL,
	"hash_contenido" char(64) NOT NULL,
	"aprobado_por" uuid NOT NULL,
	"aprobado_en" timestamp(0) with time zone NOT NULL,
	"aprobacion_anterior_id" uuid,
	CONSTRAINT "aprobaciones_revision_silabo_id_unique" UNIQUE("revision_silabo_id")
);
--> statement-breakpoint
CREATE TABLE "silabos" (
	"silabo_id" uuid PRIMARY KEY NOT NULL,
	"convocatoria_carrera_id" uuid NOT NULL,
	"estado_silabo" varchar(32) DEFAULT 'sin_iniciar' NOT NULL,
	"version_borrador" integer DEFAULT 0 NOT NULL,
	"iniciado_en" timestamp(0) with time zone,
	"guardado_en" timestamp(0) with time zone,
	"datos_academicos_silabo" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"paralelo_id" uuid NOT NULL,
	CONSTRAINT "silabos_convocatoria_id_paralelo_id_unique" UNIQUE("convocatoria_carrera_id","paralelo_id"),
	CONSTRAINT "silabos_estado_check" CHECK ((estado_silabo)::text = ANY (ARRAY[('sin_iniciar'::character varying)::text, ('borrador'::character varying)::text, ('en_revision'::character varying)::text, ('correccion_solicitada'::character varying)::text, ('aprobado'::character varying)::text]))
);
--> statement-breakpoint
CREATE TABLE "eventos_auditoria" (
	"evento_auditoria_id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid,
	"asignacion_rol_id" uuid,
	"accion" varchar(120) NOT NULL,
	"tipo_recurso" varchar(120) NOT NULL,
	"recurso_id" uuid,
	"resultado" varchar(24) NOT NULL,
	"detalles" jsonb,
	"ocurrido_en" timestamp(0) with time zone NOT NULL,
	"actor_nombre" varchar(255),
	"actor_rol" varchar(120),
	"actor_carrera" varchar(255),
	CONSTRAINT "eventos_auditoria_resultado_check" CHECK ((resultado)::text = ANY (ARRAY[('exito'::character varying)::text, ('fallido'::character varying)::text]))
);
--> statement-breakpoint
CREATE TABLE "ajustes_sistema" (
	"clave_ajuste" varchar(60) PRIMARY KEY NOT NULL,
	"valor_ajuste" jsonb NOT NULL,
	"modificado_por" uuid,
	"modificado_en" timestamp(0) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exportaciones_silabo" (
	"exportacion_silabo_id" uuid PRIMARY KEY NOT NULL,
	"revision_silabo_id" uuid NOT NULL,
	"archivo_pdf_id" uuid,
	"clave_solicitud" uuid NOT NULL,
	"estado_exportacion" varchar(24) DEFAULT 'pendiente' NOT NULL,
	"solicitado_por" uuid NOT NULL,
	"solicitado_en" timestamp(0) with time zone NOT NULL,
	"completado_en" timestamp(0) with time zone,
	CONSTRAINT "exportaciones_silabo_archivo_pdf_id_unique" UNIQUE("archivo_pdf_id"),
	CONSTRAINT "exportaciones_silabo_revision_clave_solicitud_unica" UNIQUE("clave_solicitud","revision_silabo_id"),
	CONSTRAINT "exportaciones_silabo_completitud_check" CHECK (((estado_exportacion)::text <> 'completado'::text) OR ((archivo_pdf_id IS NOT NULL) AND (completado_en IS NOT NULL))),
	CONSTRAINT "exportaciones_silabo_estado_check" CHECK ((estado_exportacion)::text = ANY (ARRAY[('pendiente'::character varying)::text, ('en_ejecucion'::character varying)::text, ('completado'::character varying)::text, ('fallido'::character varying)::text]))
);
--> statement-breakpoint
CREATE TABLE "asignaciones_rol" (
	"asignacion_rol_id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"carrera_id" uuid,
	"asignacion_rol_activa" boolean DEFAULT true NOT NULL,
	"asignado_en" timestamp(0) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"rol" varchar(20) NOT NULL,
	CONSTRAINT "asignaciones_rol_alcance_valido_check" CHECK ((((rol)::text = ANY (ARRAY[('administrador'::character varying)::text, ('bibliotecario'::character varying)::text])) AND (carrera_id IS NULL)) OR (((rol)::text = ANY (ARRAY[('coordinador'::character varying)::text, ('docente'::character varying)::text])) AND (carrera_id IS NOT NULL))),
	CONSTRAINT "asignaciones_rol_rol_valido_check" CHECK ((rol)::text = ANY (ARRAY[('administrador'::character varying)::text, ('coordinador'::character varying)::text, ('docente'::character varying)::text, ('bibliotecario'::character varying)::text]))
);
--> statement-breakpoint
CREATE TABLE "definiciones_campo" (
	"definicion_campo_id" uuid PRIMARY KEY NOT NULL,
	"campo_plantilla_id" uuid NOT NULL,
	"plantilla_id" uuid NOT NULL,
	"vigente_en_plantilla" boolean DEFAULT true NOT NULL,
	"quien_llena_definicion_campo" varchar(20) DEFAULT 'carrera' NOT NULL,
	"contenido_definicion_campo" jsonb DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb NOT NULL,
	CONSTRAINT "definiciones_campo_campo_unico" UNIQUE("campo_plantilla_id"),
	CONSTRAINT "definiciones_campo_documento_check" CHECK ((contenido_definicion_campo ? 'type'::text) AND (contenido_definicion_campo ? 'content'::text) AND (jsonb_typeof(contenido_definicion_campo) = 'object'::text) AND ((contenido_definicion_campo ->> 'type'::text) = 'doc'::text) AND (jsonb_typeof((contenido_definicion_campo -> 'content'::text)) = 'array'::text)),
	CONSTRAINT "definiciones_campo_responsable_check" CHECK ((quien_llena_definicion_campo)::text = ANY (ARRAY[('carrera'::character varying)::text, ('institucional'::character varying)::text]))
);
--> statement-breakpoint
CREATE TABLE "archivos" (
	"archivo_id" uuid PRIMARY KEY NOT NULL,
	"disco" varchar(80) NOT NULL,
	"ruta_archivo" varchar(500) NOT NULL,
	"nombre_archivo" varchar(255) NOT NULL,
	"tipo_archivo" varchar(120) NOT NULL,
	"tamano_bytes" bigint NOT NULL,
	"hash_archivo" char(64) NOT NULL,
	"categoria" varchar(80) NOT NULL,
	"subido_por" uuid,
	"almacenado_en" timestamp(0) with time zone NOT NULL,
	CONSTRAINT "archivos_disco_ruta_archivo_unique" UNIQUE("disco","ruta_archivo")
);
--> statement-breakpoint
CREATE TABLE "carreras" (
	"carrera_id" uuid PRIMARY KEY NOT NULL,
	"facultad_id" uuid NOT NULL,
	"codigo_carrera" varchar(80) NOT NULL,
	"nombre_carrera" varchar(180) NOT NULL,
	"carrera_activa" boolean DEFAULT true NOT NULL,
	"modalidad_carrera" "modalidad_estudio",
	"numero_ciclos" smallint NOT NULL,
	CONSTRAINT "carreras_codigo_carrera_unique" UNIQUE("codigo_carrera"),
	CONSTRAINT "carreras_numero_ciclos_check" CHECK ((numero_ciclos >= 1) AND (numero_ciclos <= 30))
);
--> statement-breakpoint
CREATE TABLE "migraciones" (
	"id" serial PRIMARY KEY NOT NULL,
	"migration" varchar(255) NOT NULL,
	"batch" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notificaciones" (
	"notificacion_id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"clave_unica" varchar(180) NOT NULL,
	"tipo_notificacion" varchar(100) NOT NULL,
	"titulo_notificacion" varchar(180) NOT NULL,
	"mensaje_notificacion" text NOT NULL,
	"tipo_recurso" varchar(100),
	"recurso_id" uuid,
	"leido_en" timestamp(0) with time zone,
	"notificado_en" timestamp(0) with time zone NOT NULL,
	"periodo_academico_id" uuid,
	CONSTRAINT "notificaciones_usuario_id_clave_unica_unique" UNIQUE("clave_unica","usuario_id")
);
--> statement-breakpoint
CREATE TABLE "paralelos" (
	"paralelo_id" uuid PRIMARY KEY NOT NULL,
	"codigo_paralelo" varchar(30) NOT NULL,
	"jornada_paralelo" varchar(20) NOT NULL,
	"asignatura_id" uuid NOT NULL,
	CONSTRAINT "paralelos_jornada_check" CHECK ((jornada_paralelo)::text = ANY (ARRAY[('matutina'::character varying)::text, ('vespertina'::character varying)::text, ('nocturna'::character varying)::text]))
);
--> statement-breakpoint
CREATE TABLE "facultades" (
	"facultad_id" uuid PRIMARY KEY NOT NULL,
	"nombre_facultad" varchar(180) NOT NULL,
	"facultad_activa" boolean DEFAULT true NOT NULL,
	"logo_archivo_id" uuid,
	"campus_facultad" varchar(255) NOT NULL,
	"bibliotecas_koha_facultad" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "facultades_bibliotecas_koha_lista_check" CHECK (jsonb_typeof(bibliotecas_koha_facultad) = 'array'::text),
	CONSTRAINT "facultades_campus_facultad_check" CHECK ((campus_facultad)::text = ANY (ARRAY[('Campus Matriz Dr. Gabriel Galarza López'::character varying)::text, ('Campus Laguacoto'::character varying)::text, ('Campus CENI (Centro de Eventos Nacionales e Internacionales)'::character varying)::text, ('Extensión San Miguel'::character varying)::text, ('Sede Chimbo'::character varying)::text]))
);
--> statement-breakpoint
CREATE TABLE "invitaciones_activacion" (
	"invitacion_activacion_id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"hash_activacion" char(64) NOT NULL,
	"expira_en" timestamp(0) with time zone NOT NULL,
	"usada_en" timestamp(0) with time zone,
	"invalidada_en" timestamp(0) with time zone,
	"emitida_por_usuario_id" uuid,
	"creada_en" timestamp(0) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "invitaciones_activacion_hash_activacion_unique" UNIQUE("hash_activacion")
);
--> statement-breakpoint
CREATE TABLE "firmas_silabo" (
	"firma_silabo_id" uuid PRIMARY KEY NOT NULL,
	"silabo_id" uuid NOT NULL,
	"revision_silabo_id" uuid NOT NULL,
	"firmado_como" varchar(16) NOT NULL,
	"usuario_id" uuid NOT NULL,
	"declaracion_firmada" text NOT NULL,
	"firma_cms" text NOT NULL,
	"nombre_en_certificado" varchar(255) NOT NULL,
	"numero_certificado" varchar(255) NOT NULL,
	"entidad_emisora" varchar(500) NOT NULL,
	"certificado_valido_hasta" timestamp(0) with time zone NOT NULL,
	"firmado_en" timestamp(0) with time zone NOT NULL,
	CONSTRAINT "firmas_silabo_firmado_como_unico" UNIQUE("firmado_como","silabo_id"),
	CONSTRAINT "firmas_silabo_firmado_como_check" CHECK ((firmado_como)::text = ANY (ARRAY[('docente'::character varying)::text, ('coordinacion'::character varying)::text, ('biblioteca'::character varying)::text]))
);
--> statement-breakpoint
CREATE TABLE "periodos_academicos" (
	"periodo_academico_id" uuid PRIMARY KEY NOT NULL,
	"codigo_periodo_academico" varchar(40) NOT NULL,
	"fecha_inicio_periodo" date NOT NULL,
	"fecha_fin_periodo" date NOT NULL,
	"cantidad_semanas_lectivas" smallint DEFAULT '16' NOT NULL,
	CONSTRAINT "periodos_academicos_codigo_unico" UNIQUE("codigo_periodo_academico"),
	CONSTRAINT "periodos_academicos_fechas_check" CHECK (fecha_fin_periodo >= fecha_inicio_periodo),
	CONSTRAINT "periodos_academicos_semanas_lectivas_rango" CHECK ((cantidad_semanas_lectivas >= 1) AND (cantidad_semanas_lectivas <= 52))
);
--> statement-breakpoint
CREATE TABLE "mensajes_ia_plantilla" (
	"mensaje_ia_plantilla_id" uuid PRIMARY KEY NOT NULL,
	"plantilla_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"contenido_mensaje" jsonb NOT NULL,
	"enviado_en" timestamp(6) with time zone DEFAULT clock_timestamp() NOT NULL,
	"ocultado_en" timestamp(6) with time zone,
	CONSTRAINT "mensajes_ia_plantilla_contenido_check" CHECK ((jsonb_typeof(contenido_mensaje) = 'object'::text) AND ((contenido_mensaje ->> 'rol'::text) = ANY (ARRAY['usuario'::text, 'asistente'::text])) AND ((contenido_mensaje ->> 'estado'::text) = ANY (ARRAY['pendiente'::text, 'en_ejecucion'::text, 'completado'::text, 'fallido'::text])))
);
--> statement-breakpoint
CREATE TABLE "plantilla_silabo" (
	"plantilla_id" uuid PRIMARY KEY NOT NULL,
	"plantilla_modificada_en" timestamp(6) with time zone,
	"definicion_plantilla" json DEFAULT '{}'::json NOT NULL,
	CONSTRAINT "definicion_plantilla_objeto" CHECK (json_typeof(definicion_plantilla) = 'object'::text)
);
--> statement-breakpoint
CREATE TABLE "propuestas_ia_plantilla" (
	"propuesta_ia_plantilla_id" uuid PRIMARY KEY NOT NULL,
	"plantilla_id" uuid NOT NULL,
	"mensaje_ia_plantilla_id" uuid NOT NULL,
	"solicitada_por" uuid NOT NULL,
	"estructura_propuesta" jsonb NOT NULL,
	"cambios_propuesta" jsonb NOT NULL,
	"huella_plantilla_base" char(64) NOT NULL,
	"version_borrador_propuesta" varchar(100) NOT NULL,
	"estado_propuesta" varchar(20) DEFAULT 'pendiente' NOT NULL,
	"decidida_por" uuid,
	"decidida_en" timestamp(6) with time zone,
	"creada_en" timestamp(6) with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "propuestas_ia_plantilla_mensaje_ia_plantilla_id_unique" UNIQUE("mensaje_ia_plantilla_id"),
	CONSTRAINT "propuestas_ia_plantilla_decision_check" CHECK (((estado_propuesta)::text <> ALL (ARRAY[('aplicada'::character varying)::text, ('descartada'::character varying)::text])) OR ((decidida_por IS NOT NULL) AND (decidida_en IS NOT NULL))),
	CONSTRAINT "propuestas_ia_plantilla_estado_check" CHECK ((estado_propuesta)::text = ANY (ARRAY[('pendiente'::character varying)::text, ('aplicada'::character varying)::text, ('descartada'::character varying)::text, ('vencida'::character varying)::text, ('reemplazada'::character varying)::text])),
	CONSTRAINT "propuestas_ia_plantilla_huella_check" CHECK (huella_plantilla_base ~ '^[0-9a-f]{64}$'::text)
);
--> statement-breakpoint
CREATE TABLE "restablecimientos_contrasena" (
	"email" varchar(255) PRIMARY KEY NOT NULL,
	"token" varchar(255) NOT NULL,
	"created_at" timestamp(0) with time zone
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"usuario_id" uuid PRIMARY KEY NOT NULL,
	"nombre_usuario" varchar(255) NOT NULL,
	"correo_electronico" varchar(255) NOT NULL,
	"correo_verificado_en" timestamp(0) with time zone,
	"contrasena" varchar(255) NOT NULL,
	"usuario_activo" boolean DEFAULT true NOT NULL,
	"codigo_recordarme" varchar(100),
	"secreto_dos_factores" text,
	"codigos_recuperacion_dos_factores" text,
	"dos_factores_confirmado_en" timestamp(0) with time zone,
	"formacion_experiencia_usuario" text,
	"preferencias_accesibilidad_usuario" jsonb,
	"preferencias_correo_usuario" jsonb,
	CONSTRAINT "usuarios_correo_electronico_unique" UNIQUE("correo_electronico")
);
--> statement-breakpoint
CREATE TABLE "revisiones_coordinacion" (
	"revision_coordinacion_id" uuid PRIMARY KEY NOT NULL,
	"revision_silabo_id" uuid NOT NULL,
	"revisado_por" uuid NOT NULL,
	"revisado_en" timestamp with time zone NOT NULL,
	CONSTRAINT "revisiones_coordinacion_revision_unica" UNIQUE("revision_silabo_id")
);
--> statement-breakpoint
CREATE TABLE "valores_campo" (
	"valor_campo_id" uuid PRIMARY KEY NOT NULL,
	"silabo_id" uuid,
	"definicion_campo_id" uuid NOT NULL,
	"valor_campo" jsonb,
	"asignatura_id" uuid,
	CONSTRAINT "valores_campo_un_solo_dueno_check" CHECK ((silabo_id IS NULL) <> (asignatura_id IS NULL))
);
--> statement-breakpoint
CREATE TABLE "sesiones" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"ip_address" varchar(45),
	"user_agent" text,
	"payload" text NOT NULL,
	"last_activity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requisitos_asignatura" (
	"requisito_asignatura_id" uuid PRIMARY KEY NOT NULL,
	"asignatura_id" uuid NOT NULL,
	"requisito_id" uuid NOT NULL,
	"tipo_requisito_asignatura" varchar(30) DEFAULT 'prerrequisito' NOT NULL,
	CONSTRAINT "requisitos_asignatura_par_unico" UNIQUE("asignatura_id","requisito_id"),
	CONSTRAINT "requisitos_asignatura_distintos_check" CHECK (asignatura_id <> requisito_id),
	CONSTRAINT "requisitos_asignatura_tipo_check" CHECK ((tipo_requisito_asignatura)::text = ANY (ARRAY[('prerrequisito'::character varying)::text, ('correquisito'::character varying)::text]))
);
--> statement-breakpoint
CREATE TABLE "revisiones_silabo" (
	"revision_silabo_id" uuid PRIMARY KEY NOT NULL,
	"silabo_id" uuid NOT NULL,
	"revision_anterior_id" uuid,
	"numero_revision" smallint NOT NULL,
	"clave_solicitud" uuid NOT NULL,
	"version_borrador" integer NOT NULL,
	"contenido_enviado" jsonb NOT NULL,
	"hash_contenido" char(64) NOT NULL,
	"enviado_por" uuid NOT NULL,
	"enviado_en" timestamp(0) with time zone NOT NULL,
	"correccion_justificacion" text,
	"correccion_etapa" varchar(16),
	"correccion_solicitada_por" uuid,
	"correccion_solicitada_en" timestamp with time zone,
	CONSTRAINT "revisiones_silabo_silabo_id_clave_solicitud_unique" UNIQUE("clave_solicitud","silabo_id"),
	CONSTRAINT "revisiones_silabo_silabo_id_numero_revision_unique" UNIQUE("numero_revision","silabo_id"),
	CONSTRAINT "revisiones_silabo_correccion_completa_check" CHECK (((correccion_justificacion IS NULL) AND (correccion_etapa IS NULL) AND (correccion_solicitada_por IS NULL) AND (correccion_solicitada_en IS NULL)) OR ((correccion_justificacion IS NOT NULL) AND (correccion_etapa IS NOT NULL) AND (correccion_solicitada_por IS NOT NULL) AND (correccion_solicitada_en IS NOT NULL))),
	CONSTRAINT "revisiones_silabo_correccion_etapa_check" CHECK ((correccion_etapa)::text = ANY (ARRAY[('biblioteca'::character varying)::text, ('coordinacion'::character varying)::text]))
);
--> statement-breakpoint
CREATE TABLE "secciones_plantilla" (
	"seccion_plantilla_id" uuid PRIMARY KEY NOT NULL,
	"plantilla_id" uuid NOT NULL,
	"clave_seccion_plantilla" varchar(120) NOT NULL,
	"titulo_seccion_plantilla" varchar(180) NOT NULL,
	"posicion_seccion_plantilla" smallint NOT NULL,
	"vigente_en_plantilla" boolean DEFAULT true NOT NULL,
	"orientacion_seccion_plantilla" varchar(12) DEFAULT 'portrait' NOT NULL,
	CONSTRAINT "secciones_plantilla_id_plantilla_unica" UNIQUE("plantilla_id","seccion_plantilla_id"),
	CONSTRAINT "secciones_plantilla_orientacion_check" CHECK ((orientacion_seccion_plantilla)::text = ANY (ARRAY[('portrait'::character varying)::text, ('landscape'::character varying)::text]))
);
--> statement-breakpoint
ALTER TABLE "documentos_apoyo" ADD CONSTRAINT "documentos_apoyo_archivo_id_foreign" FOREIGN KEY ("archivo_id") REFERENCES "public"."archivos"("archivo_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_apoyo" ADD CONSTRAINT "documentos_apoyo_archivo_vista_id_foreign" FOREIGN KEY ("archivo_vista_id") REFERENCES "public"."archivos"("archivo_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_apoyo" ADD CONSTRAINT "documentos_apoyo_carrera_id_foreign" FOREIGN KEY ("carrera_id") REFERENCES "public"."carreras"("carrera_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_apoyo" ADD CONSTRAINT "documentos_apoyo_subido_por_foreign" FOREIGN KEY ("subido_por") REFERENCES "public"."usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asignaciones_paralelo" ADD CONSTRAINT "asignaciones_paralelo_asignacion_rol_id_foreign" FOREIGN KEY ("asignacion_rol_id") REFERENCES "public"."asignaciones_rol"("asignacion_rol_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asignaciones_paralelo" ADD CONSTRAINT "asignaciones_paralelo_paralelo_id_foreign" FOREIGN KEY ("paralelo_id") REFERENCES "public"."paralelos"("paralelo_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envios_biblioteca" ADD CONSTRAINT "envios_biblioteca_revision_silabo_id_foreign" FOREIGN KEY ("revision_silabo_id") REFERENCES "public"."revisiones_silabo"("revision_silabo_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envios_biblioteca" ADD CONSTRAINT "envios_biblioteca_verificado_por_fkey" FOREIGN KEY ("verificado_por") REFERENCES "public"."usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convocatorias_universidad" ADD CONSTRAINT "convocatorias_universidad_periodo_academico_id_foreign" FOREIGN KEY ("periodo_academico_id") REFERENCES "public"."periodos_academicos"("periodo_academico_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convocatorias_carreras" ADD CONSTRAINT "convocatorias_carreras_carrera_id_foreign" FOREIGN KEY ("carrera_id") REFERENCES "public"."carreras"("carrera_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convocatorias_carreras" ADD CONSTRAINT "convocatorias_carreras_convocatoria_universidad_id_foreign" FOREIGN KEY ("convocatoria_universidad_id") REFERENCES "public"."convocatorias_universidad"("convocatoria_universidad_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asignaturas" ADD CONSTRAINT "asignaturas_carrera_id_foreign" FOREIGN KEY ("carrera_id") REFERENCES "public"."carreras"("carrera_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campos_plantilla" ADD CONSTRAINT "campos_plantilla_plantilla_id_foreign" FOREIGN KEY ("plantilla_id") REFERENCES "public"."plantilla_silabo"("plantilla_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campos_plantilla" ADD CONSTRAINT "campos_plantilla_seccion_misma_plantilla_foreign" FOREIGN KEY ("seccion_plantilla_id","plantilla_id") REFERENCES "public"."secciones_plantilla"("seccion_plantilla_id","plantilla_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campos_plantilla" ADD CONSTRAINT "campos_plantilla_seccion_plantilla_id_foreign" FOREIGN KEY ("seccion_plantilla_id") REFERENCES "public"."secciones_plantilla"("seccion_plantilla_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aprobaciones" ADD CONSTRAINT "aprobaciones_aprobacion_anterior_id_foreign" FOREIGN KEY ("aprobacion_anterior_id") REFERENCES "public"."aprobaciones"("aprobacion_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aprobaciones" ADD CONSTRAINT "aprobaciones_aprobado_por_foreign" FOREIGN KEY ("aprobado_por") REFERENCES "public"."usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aprobaciones" ADD CONSTRAINT "aprobaciones_revision_silabo_id_foreign" FOREIGN KEY ("revision_silabo_id") REFERENCES "public"."revisiones_silabo"("revision_silabo_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silabos" ADD CONSTRAINT "silabos_convocatoria_carrera_id_foreign" FOREIGN KEY ("convocatoria_carrera_id") REFERENCES "public"."convocatorias_carreras"("convocatoria_carrera_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silabos" ADD CONSTRAINT "silabos_paralelo_id_foreign" FOREIGN KEY ("paralelo_id") REFERENCES "public"."paralelos"("paralelo_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes_sistema" ADD CONSTRAINT "ajustes_sistema_modificado_por_foreign" FOREIGN KEY ("modificado_por") REFERENCES "public"."usuarios"("usuario_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exportaciones_silabo" ADD CONSTRAINT "exportaciones_silabo_archivo_pdf_id_foreign" FOREIGN KEY ("archivo_pdf_id") REFERENCES "public"."archivos"("archivo_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exportaciones_silabo" ADD CONSTRAINT "exportaciones_silabo_revision_silabo_id_foreign" FOREIGN KEY ("revision_silabo_id") REFERENCES "public"."revisiones_silabo"("revision_silabo_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exportaciones_silabo" ADD CONSTRAINT "exportaciones_silabo_solicitado_por_foreign" FOREIGN KEY ("solicitado_por") REFERENCES "public"."usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asignaciones_rol" ADD CONSTRAINT "asignaciones_rol_carrera_id_foreign" FOREIGN KEY ("carrera_id") REFERENCES "public"."carreras"("carrera_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asignaciones_rol" ADD CONSTRAINT "asignaciones_rol_usuario_id_foreign" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "definiciones_campo" ADD CONSTRAINT "definiciones_campo_campo_misma_plantilla_foreign" FOREIGN KEY ("campo_plantilla_id","plantilla_id") REFERENCES "public"."campos_plantilla"("campo_plantilla_id","plantilla_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "definiciones_campo" ADD CONSTRAINT "definiciones_campo_campo_plantilla_id_foreign" FOREIGN KEY ("campo_plantilla_id") REFERENCES "public"."campos_plantilla"("campo_plantilla_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "definiciones_campo" ADD CONSTRAINT "definiciones_campo_plantilla_id_foreign" FOREIGN KEY ("plantilla_id") REFERENCES "public"."plantilla_silabo"("plantilla_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_subido_por_foreign" FOREIGN KEY ("subido_por") REFERENCES "public"."usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carreras" ADD CONSTRAINT "carreras_facultad_id_foreign" FOREIGN KEY ("facultad_id") REFERENCES "public"."facultades"("facultad_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_periodo_academico_id_foreign" FOREIGN KEY ("periodo_academico_id") REFERENCES "public"."periodos_academicos"("periodo_academico_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_usuario_id_foreign" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paralelos" ADD CONSTRAINT "paralelos_asignatura_id_foreign" FOREIGN KEY ("asignatura_id") REFERENCES "public"."asignaturas"("asignatura_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facultades" ADD CONSTRAINT "facultades_logo_archivo_id_foreign" FOREIGN KEY ("logo_archivo_id") REFERENCES "public"."archivos"("archivo_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitaciones_activacion" ADD CONSTRAINT "invitaciones_activacion_emitida_por_usuario_id_foreign" FOREIGN KEY ("emitida_por_usuario_id") REFERENCES "public"."usuarios"("usuario_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitaciones_activacion" ADD CONSTRAINT "invitaciones_activacion_usuario_id_foreign" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("usuario_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firmas_silabo" ADD CONSTRAINT "firmas_silabo_revision_silabo_id_foreign" FOREIGN KEY ("revision_silabo_id") REFERENCES "public"."revisiones_silabo"("revision_silabo_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firmas_silabo" ADD CONSTRAINT "firmas_silabo_silabo_id_foreign" FOREIGN KEY ("silabo_id") REFERENCES "public"."silabos"("silabo_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firmas_silabo" ADD CONSTRAINT "firmas_silabo_usuario_id_foreign" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensajes_ia_plantilla" ADD CONSTRAINT "mensajes_ia_plantilla_plantilla_id_foreign" FOREIGN KEY ("plantilla_id") REFERENCES "public"."plantilla_silabo"("plantilla_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensajes_ia_plantilla" ADD CONSTRAINT "mensajes_ia_plantilla_usuario_id_foreign" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propuestas_ia_plantilla" ADD CONSTRAINT "propuestas_ia_plantilla_decidida_por_foreign" FOREIGN KEY ("decidida_por") REFERENCES "public"."usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propuestas_ia_plantilla" ADD CONSTRAINT "propuestas_ia_plantilla_mensaje_ia_plantilla_id_foreign" FOREIGN KEY ("mensaje_ia_plantilla_id") REFERENCES "public"."mensajes_ia_plantilla"("mensaje_ia_plantilla_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propuestas_ia_plantilla" ADD CONSTRAINT "propuestas_ia_plantilla_plantilla_id_foreign" FOREIGN KEY ("plantilla_id") REFERENCES "public"."plantilla_silabo"("plantilla_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propuestas_ia_plantilla" ADD CONSTRAINT "propuestas_ia_plantilla_solicitada_por_foreign" FOREIGN KEY ("solicitada_por") REFERENCES "public"."usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisiones_coordinacion" ADD CONSTRAINT "revisiones_coordinacion_revisado_por_fkey" FOREIGN KEY ("revisado_por") REFERENCES "public"."usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisiones_coordinacion" ADD CONSTRAINT "revisiones_coordinacion_revision_silabo_id_fkey" FOREIGN KEY ("revision_silabo_id") REFERENCES "public"."revisiones_silabo"("revision_silabo_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valores_campo" ADD CONSTRAINT "valores_campo_asignatura_id_foreign" FOREIGN KEY ("asignatura_id") REFERENCES "public"."asignaturas"("asignatura_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valores_campo" ADD CONSTRAINT "valores_campo_definicion_campo_id_foreign" FOREIGN KEY ("definicion_campo_id") REFERENCES "public"."definiciones_campo"("definicion_campo_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valores_campo" ADD CONSTRAINT "valores_campo_silabo_id_foreign" FOREIGN KEY ("silabo_id") REFERENCES "public"."silabos"("silabo_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_user_id_foreign" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("usuario_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitos_asignatura" ADD CONSTRAINT "requisitos_asignatura_asignatura_id_foreign" FOREIGN KEY ("asignatura_id") REFERENCES "public"."asignaturas"("asignatura_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitos_asignatura" ADD CONSTRAINT "requisitos_asignatura_requisito_id_foreign" FOREIGN KEY ("requisito_id") REFERENCES "public"."asignaturas"("asignatura_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisiones_silabo" ADD CONSTRAINT "revisiones_silabo_correccion_solicitada_por_foreign" FOREIGN KEY ("correccion_solicitada_por") REFERENCES "public"."usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisiones_silabo" ADD CONSTRAINT "revisiones_silabo_enviado_por_foreign" FOREIGN KEY ("enviado_por") REFERENCES "public"."usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisiones_silabo" ADD CONSTRAINT "revisiones_silabo_revision_anterior_id_foreign" FOREIGN KEY ("revision_anterior_id") REFERENCES "public"."revisiones_silabo"("revision_silabo_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisiones_silabo" ADD CONSTRAINT "revisiones_silabo_silabo_id_foreign" FOREIGN KEY ("silabo_id") REFERENCES "public"."silabos"("silabo_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secciones_plantilla" ADD CONSTRAINT "secciones_plantilla_plantilla_id_foreign" FOREIGN KEY ("plantilla_id") REFERENCES "public"."plantilla_silabo"("plantilla_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documentos_apoyo_archivo_vista_id_index" ON "documentos_apoyo" USING btree ("archivo_vista_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "documentos_apoyo_carrera_id_subido_en_index" ON "documentos_apoyo" USING btree ("carrera_id" timestamptz_ops,"subido_en" uuid_ops);--> statement-breakpoint
CREATE INDEX "documentos_apoyo_subido_por_index" ON "documentos_apoyo" USING btree ("subido_por" uuid_ops);--> statement-breakpoint
CREATE INDEX "asignaciones_paralelo_activa_idx" ON "asignaciones_paralelo" USING btree ("asignacion_rol_id" bool_ops,"asignacion_paralelo_activa" bool_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "asignaciones_paralelo_paralelo_activo_unico" ON "asignaciones_paralelo" USING btree ("paralelo_id" uuid_ops) WHERE asignacion_paralelo_activa;--> statement-breakpoint
CREATE INDEX "envios_biblioteca_verificado_por_index" ON "envios_biblioteca" USING btree ("verificado_por" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "convocatorias_universidad_en_curso_unico" ON "convocatorias_universidad" USING btree ((1) int4_ops) WHERE ((estado_convocatoria_universidad)::text = ANY (ARRAY[('abierto'::character varying)::text, ('pausado'::character varying)::text]));--> statement-breakpoint
CREATE UNIQUE INDEX "convocatorias_universidad_periodo_unico" ON "convocatorias_universidad" USING btree ("periodo_academico_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "convocatorias_carreras_carrera_id_estado_index" ON "convocatorias_carreras" USING btree ("carrera_id" text_ops,"estado_convocatoria_carrera" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "convocatorias_carreras_carrera_proceso_unico" ON "convocatorias_carreras" USING btree ("carrera_id" uuid_ops,"convocatoria_universidad_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "convocatorias_carreras_proceso_id_index" ON "convocatorias_carreras" USING btree ("convocatoria_universidad_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "bloqueos_temporales_expiration_index" ON "bloqueos_temporales" USING btree ("expiration" int8_ops);--> statement-breakpoint
CREATE INDEX "cola_trabajos_queue_index" ON "cola_trabajos" USING btree ("queue" text_ops);--> statement-breakpoint
CREATE INDEX "campos_plantilla_seccion_plantilla_id_posicion_index" ON "campos_plantilla" USING btree ("seccion_plantilla_id" int2_ops,"posicion_campo_plantilla" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "campos_plantilla_vigente_clave_unica" ON "campos_plantilla" USING btree ("plantilla_id" text_ops,"clave_campo_plantilla" text_ops) WHERE vigente_en_plantilla;--> statement-breakpoint
CREATE INDEX "datos_temporales_expiration_index" ON "datos_temporales" USING btree ("expiration" int8_ops);--> statement-breakpoint
CREATE INDEX "aprobaciones_aprobacion_anterior_id_index" ON "aprobaciones" USING btree ("aprobacion_anterior_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "aprobaciones_aprobado_por_index" ON "aprobaciones" USING btree ("aprobado_por" uuid_ops);--> statement-breakpoint
CREATE INDEX "silabos_campania_id_estado_index" ON "silabos" USING btree ("convocatoria_carrera_id" text_ops,"estado_silabo" text_ops);--> statement-breakpoint
CREATE INDEX "silabos_paralelo_id_index" ON "silabos" USING btree ("paralelo_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "eventos_auditoria_asignacion_rol_id_index" ON "eventos_auditoria" USING btree ("asignacion_rol_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "eventos_auditoria_ocurrido_en_index" ON "eventos_auditoria" USING btree ("ocurrido_en" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "eventos_auditoria_recurso_fecha_idx" ON "eventos_auditoria" USING btree ("tipo_recurso" text_ops,"recurso_id" uuid_ops,"ocurrido_en" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "eventos_auditoria_usuario_fecha_idx" ON "eventos_auditoria" USING btree ("usuario_id" timestamptz_ops,"ocurrido_en" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "ajustes_sistema_modificado_por_index" ON "ajustes_sistema" USING btree ("modificado_por" uuid_ops);--> statement-breakpoint
CREATE INDEX "exportaciones_silabo_revision_estado_solicitado_index" ON "exportaciones_silabo" USING btree ("revision_silabo_id" uuid_ops,"estado_exportacion" uuid_ops,"solicitado_en" uuid_ops);--> statement-breakpoint
CREATE INDEX "exportaciones_silabo_solicitado_por_index" ON "exportaciones_silabo" USING btree ("solicitado_por" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "asignaciones_rol_activa_unica" ON "asignaciones_rol" USING btree (usuario_id text_ops,rol text_ops,COALESCE(carrera_id, '00000000-0000-0000-0000-000000000000'::uu uuid_ops) WHERE asignacion_rol_activa;--> statement-breakpoint
CREATE INDEX "asignaciones_rol_carrera_id_index" ON "asignaciones_rol" USING btree ("carrera_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "definiciones_campo_plantilla_id_index" ON "definiciones_campo" USING btree ("plantilla_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "archivos_categoria_almacenado_en_index" ON "archivos" USING btree ("categoria" text_ops,"almacenado_en" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "archivos_hash_archivo_index" ON "archivos" USING btree ("hash_archivo" bpchar_ops);--> statement-breakpoint
CREATE INDEX "archivos_subido_por_index" ON "archivos" USING btree ("subido_por" uuid_ops);--> statement-breakpoint
CREATE INDEX "carreras_facultad_id_index" ON "carreras" USING btree ("facultad_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "notificaciones_usuario_id_periodo_academico_id_index" ON "notificaciones" USING btree ("usuario_id" uuid_ops,"periodo_academico_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "notificaciones_usuario_leido_notificado_index" ON "notificaciones" USING btree ("usuario_id" uuid_ops,"leido_en" uuid_ops,"notificado_en" timestamptz_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "paralelos_asignatura_codigo_unique" ON "paralelos" USING btree (asignatura_id text_ops,upper((codigo_paralelo)::text) text_ops);--> statement-breakpoint
CREATE INDEX "paralelos_asignatura_id_index" ON "paralelos" USING btree ("asignatura_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "facultades_logo_archivo_id_index" ON "facultades" USING btree ("logo_archivo_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "invitaciones_activacion_emitida_por_usuario_id_index" ON "invitaciones_activacion" USING btree ("emitida_por_usuario_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "invitaciones_activacion_usuario_id_expira_en_index" ON "invitaciones_activacion" USING btree ("usuario_id" uuid_ops,"expira_en" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "firmas_silabo_revision_silabo_id_index" ON "firmas_silabo" USING btree ("revision_silabo_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "firmas_silabo_usuario_id_index" ON "firmas_silabo" USING btree ("usuario_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "mensajes_ia_plantilla_idempotencia_unica" ON "mensajes_ia_plantilla" USING btree (plantilla_id text_ops,usuario_id text_ops,(((contenido_mensaje -> 'entrada'::text) ->> 'clave_idempotenci uuid_ops) WHERE ((contenido_mensaje ->> 'rol'::text) = 'usuario'::text);--> statement-breakpoint
CREATE INDEX "mensajes_ia_plantilla_plantilla_id_usuario_id_enviado_en_index" ON "mensajes_ia_plantilla" USING btree ("plantilla_id" uuid_ops,"usuario_id" timestamptz_ops,"enviado_en" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "mensajes_ia_plantilla_usuario_id_index" ON "mensajes_ia_plantilla" USING btree ("usuario_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "plantilla_silabo_unica" ON "plantilla_silabo" USING btree ((true) bool_ops);--> statement-breakpoint
CREATE INDEX "propuestas_ia_plantilla_decidida_por_index" ON "propuestas_ia_plantilla" USING btree ("decidida_por" uuid_ops);--> statement-breakpoint
CREATE INDEX "propuestas_ia_plantilla_plantilla_id_estado_propuesta_index" ON "propuestas_ia_plantilla" USING btree ("plantilla_id" text_ops,"estado_propuesta" uuid_ops);--> statement-breakpoint
CREATE INDEX "propuestas_ia_plantilla_solicitada_por_index" ON "propuestas_ia_plantilla" USING btree ("solicitada_por" uuid_ops);--> statement-breakpoint
CREATE INDEX "usuarios_usuario_activo_index" ON "usuarios" USING btree ("usuario_activo" bool_ops);--> statement-breakpoint
CREATE INDEX "revisiones_coordinacion_revisado_por_index" ON "revisiones_coordinacion" USING btree ("revisado_por" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "valores_campo_asignatura_definicion_unica" ON "valores_campo" USING btree ("asignatura_id" uuid_ops,"definicion_campo_id" uuid_ops) WHERE (asignatura_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "valores_campo_definicion_campo_id_index" ON "valores_campo" USING btree ("definicion_campo_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "valores_campo_silabo_definicion_unica" ON "valores_campo" USING btree ("silabo_id" uuid_ops,"definicion_campo_id" uuid_ops) WHERE (silabo_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "sesiones_last_activity_index" ON "sesiones" USING btree ("last_activity" int4_ops);--> statement-breakpoint
CREATE INDEX "sesiones_user_id_index" ON "sesiones" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "requisitos_asignatura_requisito_id_index" ON "requisitos_asignatura" USING btree ("requisito_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "revisiones_silabo_correccion_solicitada_por_index" ON "revisiones_silabo" USING btree ("correccion_solicitada_por" uuid_ops);--> statement-breakpoint
CREATE INDEX "revisiones_silabo_enviado_por_index" ON "revisiones_silabo" USING btree ("enviado_por" uuid_ops);--> statement-breakpoint
CREATE INDEX "revisiones_silabo_revision_anterior_id_index" ON "revisiones_silabo" USING btree ("revision_anterior_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "revisiones_silabo_silabo_id_enviado_en_index" ON "revisiones_silabo" USING btree ("silabo_id" uuid_ops,"enviado_en" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "secciones_plantilla_plantilla_id_posicion_index" ON "secciones_plantilla" USING btree ("plantilla_id" uuid_ops,"posicion_seccion_plantilla" int2_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "secciones_plantilla_vigente_clave_unica" ON "secciones_plantilla" USING btree ("plantilla_id" uuid_ops,"clave_seccion_plantilla" text_ops) WHERE vigente_en_plantilla;--> statement-breakpoint
CREATE VIEW "public"."docentes_vigentes_silabo" AS (SELECT silabos.silabo_id, asignaciones_rol.usuario_id, asignaciones_rol.asignacion_rol_id, asignaciones_paralelo.asignacion_paralelo_id, silabos.paralelo_id FROM silabos JOIN asignaciones_paralelo ON asignaciones_paralelo.paralelo_id = silabos.paralelo_id AND asignaciones_paralelo.asignacion_paralelo_activa JOIN asignaciones_rol ON asignaciones_rol.asignacion_rol_id = asignaciones_paralelo.asignacion_rol_id AND asignaciones_rol.asignacion_rol_activa AND asignaciones_rol.rol::text = 'docente'::text);
*/