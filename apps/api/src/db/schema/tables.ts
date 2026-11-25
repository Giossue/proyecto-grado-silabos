import { pgTable, index, foreignKey, unique, check, uuid, varchar, timestamp, uniqueIndex, boolean, integer, bigint, smallint, numeric, text, char, jsonb, date, json, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const modalidadEstudio = pgEnum("modalidad_estudio", ["Presencial", "Semipresencial", "En línea", "A distancia", "Híbrida"])


export const documentosApoyo = pgTable("documentos_apoyo", {
  documentoApoyoId: uuid("documento_apoyo_id").primaryKey().notNull(),
  carreraId: uuid("carrera_id").notNull(),
  tituloDocumento: varchar("titulo_documento", { length: 180 }).notNull(),
  archivoId: uuid("archivo_id").notNull(),
  archivoVistaId: uuid("archivo_vista_id"),
  estadoVista: varchar("estado_vista", { length: 20 }).default("pendiente").notNull(),
  subidoPor: uuid("subido_por").notNull(),
  subidoEn: timestamp("subido_en", { precision: 0, withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index().using("btree", table.archivoVistaId),
  index().using("btree", table.carreraId, table.subidoEn),
  index().using("btree", table.subidoPor),
  foreignKey({
      columns: [table.archivoId],
      foreignColumns: [archivos.archivoId],
      name: "documentos_apoyo_archivo_id_foreign"
    }).onDelete("restrict"),
  foreignKey({
      columns: [table.archivoVistaId],
      foreignColumns: [archivos.archivoId],
      name: "documentos_apoyo_archivo_vista_id_foreign"
    }).onDelete("restrict"),
  foreignKey({
      columns: [table.carreraId],
      foreignColumns: [carreras.carreraId],
      name: "documentos_apoyo_carrera_id_foreign"
    }).onDelete("restrict"),
  foreignKey({
      columns: [table.subidoPor],
      foreignColumns: [usuarios.usuarioId],
      name: "documentos_apoyo_subido_por_foreign"
    }).onDelete("restrict"),
  unique("documentos_apoyo_archivo_id_unique").on(table.archivoId),
  check("documentos_apoyo_estado_vista_check", sql`(estado_vista)::text = ANY (ARRAY[('pendiente'::character varying)::text, ('lista'::character varying)::text, ('sin_vista'::character varying)::text])`),
  check("documentos_apoyo_titulo_check", sql`btrim((titulo_documento)::text) <> ''::text`),
  check("documentos_apoyo_vista_check", sql`((estado_vista)::text <> 'lista'::text) OR (archivo_vista_id IS NOT NULL)`),
])

export const asignacionesParalelo = pgTable("asignaciones_paralelo", {
  asignacionParaleloId: uuid("asignacion_paralelo_id").primaryKey().notNull(),
  paraleloId: uuid("paralelo_id").notNull(),
  asignacionParaleloActiva: boolean("asignacion_paralelo_activa").default(true).notNull(),
  asignadoEn: timestamp("asignado_en", { precision: 0, withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  asignacionRolId: uuid("asignacion_rol_id").notNull(),
}, (table) => [
  index("asignaciones_paralelo_activa_idx").using("btree", table.asignacionRolId, table.asignacionParaleloActiva),
  uniqueIndex("asignaciones_paralelo_paralelo_activo_unico").using("btree", table.paraleloId).where(sql`asignacion_paralelo_activa`),
  foreignKey({
      columns: [table.asignacionRolId],
      foreignColumns: [asignacionesRol.asignacionRolId],
      name: "asignaciones_paralelo_asignacion_rol_id_foreign"
    }).onDelete("restrict"),
  foreignKey({
      columns: [table.paraleloId],
      foreignColumns: [paralelos.paraleloId],
      name: "asignaciones_paralelo_paralelo_id_foreign"
    }).onDelete("restrict"),
])

export const enviosBiblioteca = pgTable("envios_biblioteca", {
  envioBibliotecaId: uuid("envio_biblioteca_id").primaryKey().notNull(),
  revisionSilaboId: uuid("revision_silabo_id").notNull(),
  verificadoPor: uuid("verificado_por"),
  verificadoEn: timestamp("verificado_en", { withTimezone: true, mode: "string" }),
  verificacionHeredada: boolean("verificacion_heredada").default(false).notNull(),
}, (table) => [
  index().using("btree", table.verificadoPor),
  foreignKey({
      columns: [table.revisionSilaboId],
      foreignColumns: [revisionesSilabo.revisionSilaboId],
      name: "envios_biblioteca_revision_silabo_id_foreign"
    }).onDelete("restrict"),
  foreignKey({
      columns: [table.verificadoPor],
      foreignColumns: [usuarios.usuarioId],
      name: "envios_biblioteca_verificado_por_fkey"
    }).onDelete("restrict"),
  unique("envios_biblioteca_revision_unica").on(table.revisionSilaboId),
  check("envios_biblioteca_herencia_verificada", sql`(NOT verificacion_heredada) OR (verificado_en IS NOT NULL)`),
  check("envios_biblioteca_verificacion_completa", sql`(verificado_por IS NULL) = (verificado_en IS NULL)`),
])

export const convocatoriasUniversidad = pgTable("convocatorias_universidad", {
  convocatoriaUniversidadId: uuid("convocatoria_universidad_id").primaryKey().notNull(),
  fechaInicio: timestamp("fecha_inicio", { precision: 0, withTimezone: true, mode: "string" }).notNull(),
  fechaEntrega: timestamp("fecha_entrega", { precision: 0, withTimezone: true, mode: "string" }).notNull(),
  estadoConvocatoriaUniversidad: varchar("estado_convocatoria_universidad", { length: 20 }).default("abierto").notNull(),
  periodoAcademicoId: uuid("periodo_academico_id").notNull(),
  pausadoEn: timestamp("pausado_en", { precision: 6, withTimezone: true, mode: "string" }),
  cantidadProrrogas: integer("cantidad_prorrogas").default(0).notNull(),
  finalizadaEn: timestamp("finalizada_en", { precision: 6, withTimezone: true, mode: "string" }),
}, (table) => [
  uniqueIndex("convocatorias_universidad_en_curso_unico").using("btree", sql`(1)`).where(sql`((estado_convocatoria_universidad)::text = ANY (ARRAY[('abierto'::character varying)::text, ('pausado'::character varying)::text]))`),
  uniqueIndex("convocatorias_universidad_periodo_unico").using("btree", table.periodoAcademicoId),
  foreignKey({
      columns: [table.periodoAcademicoId],
      foreignColumns: [periodosAcademicos.periodoAcademicoId],
      name: "convocatorias_universidad_periodo_academico_id_foreign"
    }).onDelete("restrict"),
  check("convocatorias_universidad_cantidad_prorrogas_check", sql`cantidad_prorrogas >= 0`),
  check("convocatorias_universidad_estado_check", sql`(estado_convocatoria_universidad)::text = ANY (ARRAY[('abierto'::character varying)::text, ('pausado'::character varying)::text, ('cerrado'::character varying)::text])`),
  check("convocatorias_universidad_fechas_check", sql`fecha_entrega > fecha_inicio`),
  check("convocatorias_universidad_finalizada_en_check", sql`(finalizada_en IS NULL) OR ((estado_convocatoria_universidad)::text = 'cerrado'::text)`),
])

export const convocatoriasCarreras = pgTable("convocatorias_carreras", {
  convocatoriaCarreraId: uuid("convocatoria_carrera_id").primaryKey().notNull(),
  carreraId: uuid("carrera_id").notNull(),
  estadoConvocatoriaCarrera: varchar("estado_convocatoria_carrera", { length: 24 }).default("preparacion").notNull(),
  convocatoriaUniversidadId: uuid("convocatoria_universidad_id").notNull(),
  estadoPrevioCierreConvocatoriaCarrera: varchar("estado_previo_cierre_convocatoria_carrera", { length: 24 }),
}, (table) => [
  index("convocatorias_carreras_carrera_id_estado_index").using("btree", table.carreraId, table.estadoConvocatoriaCarrera),
  uniqueIndex("convocatorias_carreras_carrera_proceso_unico").using("btree", table.carreraId, table.convocatoriaUniversidadId),
  index("convocatorias_carreras_proceso_id_index").using("btree", table.convocatoriaUniversidadId),
  foreignKey({
      columns: [table.carreraId],
      foreignColumns: [carreras.carreraId],
      name: "convocatorias_carreras_carrera_id_foreign"
    }).onDelete("restrict"),
  foreignKey({
      columns: [table.convocatoriaUniversidadId],
      foreignColumns: [convocatoriasUniversidad.convocatoriaUniversidadId],
      name: "convocatorias_carreras_convocatoria_universidad_id_foreign"
    }).onDelete("restrict"),
  check("convocatorias_carreras_estado_check", sql`(estado_convocatoria_carrera)::text = ANY (ARRAY[('preparacion'::character varying)::text, ('abierta'::character varying)::text, ('pausada'::character varying)::text, ('cerrada'::character varying)::text])`),
  check("convocatorias_carreras_estado_previo_cierre_check", sql`(estado_previo_cierre_convocatoria_carrera IS NULL) OR (((estado_convocatoria_carrera)::text = 'cerrada'::text) AND ((estado_previo_cierre_convocatoria_carrera)::text = ANY (ARRAY[('abierta'::character varying)::text, ('pausada'::character varying)::text])))`),
])


export const asignaturas = pgTable("asignaturas", {
  asignaturaId: uuid("asignatura_id").primaryKey().notNull(),
  codigoAsignatura: varchar("codigo_asignatura", { length: 80 }).notNull(),
  nombreAsignatura: varchar("nombre_asignatura", { length: 180 }).notNull(),
  cicloAsignatura: smallint("ciclo_asignatura"),
  creditosAsignatura: numeric("creditos_asignatura", { precision: 6, scale: 2 }),
  asignaturaActiva: boolean("asignatura_activa").default(true).notNull(),
  horasDocencia: numeric("horas_docencia", { precision: 6, scale: 2 }),
  horasPracticas: numeric("horas_practicas", { precision: 6, scale: 2 }),
  horasAutonomas: numeric("horas_autonomas", { precision: 6, scale: 2 }),
  ordenAsignaturaEnCiclo: smallint("orden_asignatura_en_ciclo").default(sql`'0'`).notNull(),
  unidadCurricularAsignatura: varchar("unidad_curricular_asignatura", { length: 30 }),
  modalidadAsignatura: modalidadEstudio("modalidad_asignatura"),
  carreraId: uuid("carrera_id").notNull(),
  totalHorasAsignatura: smallint("total_horas_asignatura").generatedAlwaysAs(sql`(round(((COALESCE(horas_docencia, (0)::numeric) + COALESCE(horas_practicas, (0)::numeric)) + COALESCE(horas_autonomas, (0)::numeric))))::smallint`),
  generaSilaboAsignatura: boolean("genera_silabo_asignatura").default(true).notNull(),
}, (table) => [
  foreignKey({
      columns: [table.carreraId],
      foreignColumns: [carreras.carreraId],
      name: "asignaturas_carrera_id_foreign"
    }).onDelete("restrict"),
  unique("asignaturas_carrera_id_codigo_asignatura_unique").on(table.carreraId, table.codigoAsignatura),
  unique("asignaturas_identidad_carrera_unica").on(table.asignaturaId, table.carreraId),
  check("asignaturas_unidad_curricular_check", sql`(unidad_curricular_asignatura)::text = ANY (ARRAY[('basica'::character varying)::text, ('profesional'::character varying)::text, ('integracion_curricular'::character varying)::text])`),
])


export const camposPlantilla = pgTable("campos_plantilla", {
  campoPlantillaId: uuid("campo_plantilla_id").primaryKey().notNull(),
  seccionPlantillaId: uuid("seccion_plantilla_id").notNull(),
  plantillaId: uuid("plantilla_id").notNull(),
  claveCampoPlantilla: varchar("clave_campo_plantilla", { length: 120 }).notNull(),
  tituloCampoPlantilla: varchar("titulo_campo_plantilla", { length: 180 }).default("").notNull(),
  posicionCampoPlantilla: smallint("posicion_campo_plantilla").notNull(),
  vigenteEnPlantilla: boolean("vigente_en_plantilla").default(true).notNull(),
}, (table) => [
  index("campos_plantilla_seccion_plantilla_id_posicion_index").using("btree", table.seccionPlantillaId, table.posicionCampoPlantilla),
  uniqueIndex("campos_plantilla_vigente_clave_unica").using("btree", table.plantillaId, table.claveCampoPlantilla).where(sql`vigente_en_plantilla`),
  foreignKey({
      columns: [table.plantillaId],
      foreignColumns: [plantillaSilabo.plantillaId],
      name: "campos_plantilla_plantilla_id_foreign"
    }).onDelete("cascade"),
  foreignKey({
      columns: [table.seccionPlantillaId, table.plantillaId],
      foreignColumns: [seccionesPlantilla.seccionPlantillaId, seccionesPlantilla.plantillaId],
      name: "campos_plantilla_seccion_misma_plantilla_foreign"
    }).onDelete("restrict"),
  foreignKey({
      columns: [table.seccionPlantillaId],
      foreignColumns: [seccionesPlantilla.seccionPlantillaId],
      name: "campos_plantilla_seccion_plantilla_id_foreign"
    }).onDelete("cascade"),
  unique("campos_plantilla_id_plantilla_unica").on(table.campoPlantillaId, table.plantillaId),
])


export const aprobaciones = pgTable("aprobaciones", {
  aprobacionId: uuid("aprobacion_id").primaryKey().notNull(),
  revisionSilaboId: uuid("revision_silabo_id").notNull(),
  claveSolicitud: uuid("clave_solicitud").notNull(),
  hashContenido: char("hash_contenido", { length: 64 }).notNull(),
  aprobadoPor: uuid("aprobado_por").notNull(),
  aprobadoEn: timestamp("aprobado_en", { precision: 0, withTimezone: true, mode: "string" }).notNull(),
  aprobacionAnteriorId: uuid("aprobacion_anterior_id"),
}, (table) => [
  index().using("btree", table.aprobacionAnteriorId),
  index().using("btree", table.aprobadoPor),
  foreignKey({
      columns: [table.aprobacionAnteriorId],
      foreignColumns: [table.aprobacionId],
      name: "aprobaciones_aprobacion_anterior_id_foreign"
    }).onDelete("restrict"),
  foreignKey({
      columns: [table.aprobadoPor],
      foreignColumns: [usuarios.usuarioId],
      name: "aprobaciones_aprobado_por_foreign"
    }).onDelete("restrict"),
  foreignKey({
      columns: [table.revisionSilaboId],
      foreignColumns: [revisionesSilabo.revisionSilaboId],
      name: "aprobaciones_revision_silabo_id_foreign"
    }).onDelete("restrict"),
  unique("aprobaciones_revision_silabo_id_unique").on(table.revisionSilaboId),
])

export const silabos = pgTable("silabos", {
  silaboId: uuid("silabo_id").primaryKey().notNull(),
  convocatoriaCarreraId: uuid("convocatoria_carrera_id").notNull(),
  estadoSilabo: varchar("estado_silabo", { length: 32 }).default("sin_iniciar").notNull(),
  versionBorrador: integer("version_borrador").default(0).notNull(),
  iniciadoEn: timestamp("iniciado_en", { precision: 0, withTimezone: true, mode: "string" }),
  guardadoEn: timestamp("guardado_en", { precision: 0, withTimezone: true, mode: "string" }),
  datosAcademicosSilabo: jsonb("datos_academicos_silabo").default({}).notNull(),
  paraleloId: uuid("paralelo_id").notNull(),
}, (table) => [
  index("silabos_campania_id_estado_index").using("btree", table.convocatoriaCarreraId, table.estadoSilabo),
  index().using("btree", table.paraleloId),
  foreignKey({
      columns: [table.convocatoriaCarreraId],
      foreignColumns: [convocatoriasCarreras.convocatoriaCarreraId],
      name: "silabos_convocatoria_carrera_id_foreign"
    }).onDelete("restrict"),
  foreignKey({
      columns: [table.paraleloId],
      foreignColumns: [paralelos.paraleloId],
      name: "silabos_paralelo_id_foreign"
    }).onDelete("restrict"),
  unique("silabos_convocatoria_id_paralelo_id_unique").on(table.convocatoriaCarreraId, table.paraleloId),
  check("silabos_estado_check", sql`(estado_silabo)::text = ANY (ARRAY[('sin_iniciar'::character varying)::text, ('borrador'::character varying)::text, ('en_revision'::character varying)::text, ('correccion_solicitada'::character varying)::text, ('aprobado'::character varying)::text])`),
])

export const ajustesSistema = pgTable("ajustes_sistema", {
  claveAjuste: varchar("clave_ajuste", { length: 60 }).primaryKey().notNull(),
  valorAjuste: jsonb("valor_ajuste").notNull(),
  modificadoPor: uuid("modificado_por"),
  modificadoEn: timestamp("modificado_en", { precision: 0, withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index().using("btree", table.modificadoPor),
  foreignKey({
      columns: [table.modificadoPor],
      foreignColumns: [usuarios.usuarioId],
      name: "ajustes_sistema_modificado_por_foreign"
    }).onDelete("set null"),
])

export const exportacionesSilabo = pgTable("exportaciones_silabo", {
  exportacionSilaboId: uuid("exportacion_silabo_id").primaryKey().notNull(),
  revisionSilaboId: uuid("revision_silabo_id").notNull(),
  archivoPdfId: uuid("archivo_pdf_id"),
  claveSolicitud: uuid("clave_solicitud").notNull(),
  estadoExportacion: varchar("estado_exportacion", { length: 24 }).default("pendiente").notNull(),
  solicitadoPor: uuid("solicitado_por").notNull(),
  solicitadoEn: timestamp("solicitado_en", { precision: 0, withTimezone: true, mode: "string" }).notNull(),
  completadoEn: timestamp("completado_en", { precision: 0, withTimezone: true, mode: "string" }),
}, (table) => [
  index("exportaciones_silabo_revision_estado_solicitado_index").using("btree", table.revisionSilaboId, table.estadoExportacion, table.solicitadoEn),
  index().using("btree", table.solicitadoPor),
  foreignKey({
      columns: [table.archivoPdfId],
      foreignColumns: [archivos.archivoId],
      name: "exportaciones_silabo_archivo_pdf_id_foreign"
    }).onDelete("restrict"),
  foreignKey({
      columns: [table.revisionSilaboId],
      foreignColumns: [revisionesSilabo.revisionSilaboId],
      name: "exportaciones_silabo_revision_silabo_id_foreign"
    }).onDelete("restrict"),
  foreignKey({
      columns: [table.solicitadoPor],
      foreignColumns: [usuarios.usuarioId],
      name: "exportaciones_silabo_solicitado_por_foreign"
    }).onDelete("restrict"),
  unique("exportaciones_silabo_archivo_pdf_id_unique").on(table.archivoPdfId),
  unique("exportaciones_silabo_revision_clave_solicitud_unica").on(table.revisionSilaboId, table.claveSolicitud),
  check("exportaciones_silabo_completitud_check", sql`((estado_exportacion)::text <> 'completado'::text) OR ((archivo_pdf_id IS NOT NULL) AND (completado_en IS NOT NULL))`),
  check("exportaciones_silabo_estado_check", sql`(estado_exportacion)::text = ANY (ARRAY[('pendiente'::character varying)::text, ('en_ejecucion'::character varying)::text, ('completado'::character varying)::text, ('fallido'::character varying)::text])`),
])

export const asignacionesRol = pgTable("asignaciones_rol", {
  asignacionRolId: uuid("asignacion_rol_id").primaryKey().notNull(),
  usuarioId: uuid("usuario_id").notNull(),
  carreraId: uuid("carrera_id"),
  asignacionRolActiva: boolean("asignacion_rol_activa").default(true).notNull(),
  asignadoEn: timestamp("asignado_en", { precision: 0, withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  rol: varchar({ length: 20 }).notNull(),
}, (table) => [
  uniqueIndex("asignaciones_rol_activa_unica").using("btree", table.usuarioId, table.rol, sql`COALESCE(carrera_id, '00000000-0000-0000-0000-000000000000'::uuid)`).where(sql`asignacion_rol_activa`),
  index().using("btree", table.carreraId),
  foreignKey({
      columns: [table.carreraId],
      foreignColumns: [carreras.carreraId],
      name: "asignaciones_rol_carrera_id_foreign"
    }).onDelete("restrict"),
  foreignKey({
      columns: [table.usuarioId],
      foreignColumns: [usuarios.usuarioId],
      name: "asignaciones_rol_usuario_id_foreign"
    }).onDelete("restrict"),
  check("asignaciones_rol_alcance_valido_check", sql`(((rol)::text = ANY (ARRAY[('administrador'::character varying)::text, ('bibliotecario'::character varying)::text])) AND (carrera_id IS NULL)) OR (((rol)::text = ANY (ARRAY[('coordinador'::character varying)::text, ('docente'::character varying)::text])) AND (carrera_id IS NOT NULL))`),
  check("asignaciones_rol_rol_valido_check", sql`(rol)::text = ANY (ARRAY[('administrador'::character varying)::text, ('coordinador'::character varying)::text, ('docente'::character varying)::text, ('bibliotecario'::character varying)::text])`),
])

export const definicionesCampo = pgTable("definiciones_campo", {
  definicionCampoId: uuid("definicion_campo_id").primaryKey().notNull(),
  campoPlantillaId: uuid("campo_plantilla_id").notNull(),
  plantillaId: uuid("plantilla_id").notNull(),
  vigenteEnPlantilla: boolean("vigente_en_plantilla").default(true).notNull(),
  quienLlenaDefinicionCampo: varchar("quien_llena_definicion_campo", { length: 20 }).default("carrera").notNull(),
  contenidoDefinicionCampo: jsonb("contenido_definicion_campo").default({"type":"doc","content":[{"type":"paragraph"}]}).notNull(),
}, (table) => [
  index().using("btree", table.plantillaId),
  foreignKey({
      columns: [table.campoPlantillaId, table.plantillaId],
      foreignColumns: [camposPlantilla.campoPlantillaId, camposPlantilla.plantillaId],
      name: "definiciones_campo_campo_misma_plantilla_foreign"
    }).onDelete("restrict"),
  foreignKey({
      columns: [table.campoPlantillaId],
      foreignColumns: [camposPlantilla.campoPlantillaId],
      name: "definiciones_campo_campo_plantilla_id_foreign"
    }).onDelete("cascade"),
  foreignKey({
      columns: [table.plantillaId],
      foreignColumns: [plantillaSilabo.plantillaId],
      name: "definiciones_campo_plantilla_id_foreign"
    }).onDelete("cascade"),
  unique("definiciones_campo_campo_unico").on(table.campoPlantillaId),
  check("definiciones_campo_documento_check", sql`(contenido_definicion_campo ? 'type'::text) AND (contenido_definicion_campo ? 'content'::text) AND (jsonb_typeof(contenido_definicion_campo) = 'object'::text) AND ((contenido_definicion_campo ->> 'type'::text) = 'doc'::text) AND (jsonb_typeof((contenido_definicion_campo -> 'content'::text)) = 'array'::text)`),
  check("definiciones_campo_responsable_check", sql`(quien_llena_definicion_campo)::text = ANY (ARRAY[('carrera'::character varying)::text, ('institucional'::character varying)::text])`),
])

export const archivos = pgTable("archivos", {
  archivoId: uuid("archivo_id").primaryKey().notNull(),
  disco: varchar({ length: 80 }).notNull(),
  rutaArchivo: varchar("ruta_archivo", { length: 500 }).notNull(),
  nombreArchivo: varchar("nombre_archivo", { length: 255 }).notNull(),
  tipoArchivo: varchar("tipo_archivo", { length: 120 }).notNull(),
  tamanoBytes: bigint("tamano_bytes", { mode: "number" }).notNull(),
  hashArchivo: char("hash_archivo", { length: 64 }).notNull(),
  categoria: varchar({ length: 80 }).notNull(),
  subidoPor: uuid("subido_por"),
  almacenadoEn: timestamp("almacenado_en", { precision: 0, withTimezone: true, mode: "string" }).notNull(),
}, (table) => [
  index().using("btree", table.categoria, table.almacenadoEn),
  index().using("btree", table.hashArchivo),
  index().using("btree", table.subidoPor),
  foreignKey({
      columns: [table.subidoPor],
      foreignColumns: [usuarios.usuarioId],
      name: "archivos_subido_por_foreign"
    }).onDelete("restrict"),
  unique("archivos_disco_ruta_archivo_unique").on(table.disco, table.rutaArchivo),
])

export const carreras = pgTable("carreras", {
  carreraId: uuid("carrera_id").primaryKey().notNull(),
  facultadId: uuid("facultad_id").notNull(),
  codigoCarrera: varchar("codigo_carrera", { length: 80 }).notNull(),
  nombreCarrera: varchar("nombre_carrera", { length: 180 }).notNull(),
  carreraActiva: boolean("carrera_activa").default(true).notNull(),
  modalidadCarrera: modalidadEstudio("modalidad_carrera"),
  numeroCiclos: smallint("numero_ciclos").notNull(),
}, (table) => [
  index().using("btree", table.facultadId),
  foreignKey({
      columns: [table.facultadId],
      foreignColumns: [facultades.facultadId],
      name: "carreras_facultad_id_foreign"
    }).onDelete("restrict"),
  unique("carreras_codigo_carrera_unique").on(table.codigoCarrera),
  check("carreras_numero_ciclos_check", sql`(numero_ciclos >= 1) AND (numero_ciclos <= 30)`),
])

export const notificaciones = pgTable("notificaciones", {
  notificacionId: uuid("notificacion_id").primaryKey().notNull(),
  usuarioId: uuid("usuario_id").notNull(),
  claveUnica: varchar("clave_unica", { length: 180 }).notNull(),
  tipoNotificacion: varchar("tipo_notificacion", { length: 100 }).notNull(),
  tituloNotificacion: varchar("titulo_notificacion", { length: 180 }).notNull(),
  mensajeNotificacion: text("mensaje_notificacion").notNull(),
  tipoRecurso: varchar("tipo_recurso", { length: 100 }),
  recursoId: uuid("recurso_id"),
  leidoEn: timestamp("leido_en", { precision: 0, withTimezone: true, mode: "string" }),
  notificadoEn: timestamp("notificado_en", { precision: 0, withTimezone: true, mode: "string" }).notNull(),
  periodoAcademicoId: uuid("periodo_academico_id"),
}, (table) => [
  index().using("btree", table.usuarioId, table.periodoAcademicoId),
  index("notificaciones_usuario_leido_notificado_index").using("btree", table.usuarioId, table.leidoEn, table.notificadoEn),
  foreignKey({
      columns: [table.periodoAcademicoId],
      foreignColumns: [periodosAcademicos.periodoAcademicoId],
      name: "notificaciones_periodo_academico_id_foreign"
    }).onDelete("set null"),
  foreignKey({
      columns: [table.usuarioId],
      foreignColumns: [usuarios.usuarioId],
      name: "notificaciones_usuario_id_foreign"
    }).onDelete("restrict"),
  unique("notificaciones_usuario_id_clave_unica_unique").on(table.usuarioId, table.claveUnica),
])

export const paralelos = pgTable("paralelos", {
  paraleloId: uuid("paralelo_id").primaryKey().notNull(),
  codigoParalelo: varchar("codigo_paralelo", { length: 30 }).notNull(),
  jornadaParalelo: varchar("jornada_paralelo", { length: 20 }).notNull(),
  asignaturaId: uuid("asignatura_id").notNull(),
}, (table) => [
  uniqueIndex("paralelos_asignatura_codigo_unique").using("btree", table.asignaturaId, sql`upper((codigo_paralelo)::text)`),
  index().using("btree", table.asignaturaId),
  foreignKey({
      columns: [table.asignaturaId],
      foreignColumns: [asignaturas.asignaturaId],
      name: "paralelos_asignatura_id_foreign"
    }).onDelete("restrict"),
  check("paralelos_jornada_check", sql`(jornada_paralelo)::text = ANY (ARRAY[('matutina'::character varying)::text, ('vespertina'::character varying)::text, ('nocturna'::character varying)::text])`),
])

export const facultades = pgTable("facultades", {
  facultadId: uuid("facultad_id").primaryKey().notNull(),
  nombreFacultad: varchar("nombre_facultad", { length: 180 }).notNull(),
  facultadActiva: boolean("facultad_activa").default(true).notNull(),
  logoArchivoId: uuid("logo_archivo_id"),
  campusFacultad: varchar("campus_facultad", { length: 255 }).notNull(),
  bibliotecasKohaFacultad: jsonb("bibliotecas_koha_facultad").default([]).notNull(),
}, (table) => [
  index().using("btree", table.logoArchivoId),
  foreignKey({
      columns: [table.logoArchivoId],
      foreignColumns: [archivos.archivoId],
      name: "facultades_logo_archivo_id_foreign"
    }).onDelete("restrict"),
  check("facultades_bibliotecas_koha_lista_check", sql`jsonb_typeof(bibliotecas_koha_facultad) = 'array'::text`),
  check("facultades_campus_facultad_check", sql`(campus_facultad)::text = ANY (ARRAY[('Campus Matriz Dr. Gabriel Galarza López'::character varying)::text, ('Campus Laguacoto'::character varying)::text, ('Campus CENI (Centro de Eventos Nacionales e Internacionales)'::character varying)::text, ('Extensión San Miguel'::character varying)::text, ('Sede Chimbo'::character varying)::text])`),
])

export const invitacionesActivacion = pgTable("invitaciones_activacion", {
  invitacionActivacionId: uuid("invitacion_activacion_id").primaryKey().notNull(),
  usuarioId: uuid("usuario_id").notNull(),
  hashActivacion: char("hash_activacion", { length: 64 }).notNull(),
  expiraEn: timestamp("expira_en", { precision: 0, withTimezone: true, mode: "string" }).notNull(),
  usadaEn: timestamp("usada_en", { precision: 0, withTimezone: true, mode: "string" }),
  invalidadaEn: timestamp("invalidada_en", { precision: 0, withTimezone: true, mode: "string" }),
  emitidaPorUsuarioId: uuid("emitida_por_usuario_id"),
  creadaEn: timestamp("creada_en", { precision: 0, withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index().using("btree", table.emitidaPorUsuarioId),
  index().using("btree", table.usuarioId, table.expiraEn),
  foreignKey({
      columns: [table.emitidaPorUsuarioId],
      foreignColumns: [usuarios.usuarioId],
      name: "invitaciones_activacion_emitida_por_usuario_id_foreign"
    }).onDelete("set null"),
  foreignKey({
      columns: [table.usuarioId],
      foreignColumns: [usuarios.usuarioId],
      name: "invitaciones_activacion_usuario_id_foreign"
    }).onDelete("cascade"),
  unique("invitaciones_activacion_hash_activacion_unique").on(table.hashActivacion),
])

export const firmasSilabo = pgTable("firmas_silabo", {
  firmaSilaboId: uuid("firma_silabo_id").primaryKey().notNull(),
  silaboId: uuid("silabo_id").notNull(),
  revisionSilaboId: uuid("revision_silabo_id").notNull(),
  firmadoComo: varchar("firmado_como", { length: 16 }).notNull(),
  usuarioId: uuid("usuario_id").notNull(),
  declaracionFirmada: text("declaracion_firmada").notNull(),
  firmaCms: text("firma_cms").notNull(),
  nombreEnCertificado: varchar("nombre_en_certificado", { length: 255 }).notNull(),
  numeroCertificado: varchar("numero_certificado", { length: 255 }).notNull(),
  entidadEmisora: varchar("entidad_emisora", { length: 500 }).notNull(),
  certificadoValidoHasta: timestamp("certificado_valido_hasta", { precision: 0, withTimezone: true, mode: "string" }).notNull(),
  firmadoEn: timestamp("firmado_en", { precision: 0, withTimezone: true, mode: "string" }).notNull(),
}, (table) => [
  index().using("btree", table.revisionSilaboId),
  index().using("btree", table.usuarioId),
  foreignKey({
      columns: [table.revisionSilaboId],
      foreignColumns: [revisionesSilabo.revisionSilaboId],
      name: "firmas_silabo_revision_silabo_id_foreign"
    }).onDelete("restrict"),
  foreignKey({
      columns: [table.silaboId],
      foreignColumns: [silabos.silaboId],
      name: "firmas_silabo_silabo_id_foreign"
    }).onDelete("restrict"),
  foreignKey({
      columns: [table.usuarioId],
      foreignColumns: [usuarios.usuarioId],
      name: "firmas_silabo_usuario_id_foreign"
    }).onDelete("restrict"),
  unique("firmas_silabo_firmado_como_unico").on(table.silaboId, table.firmadoComo),
  check("firmas_silabo_firmado_como_check", sql`(firmado_como)::text = ANY (ARRAY[('docente'::character varying)::text, ('coordinacion'::character varying)::text, ('biblioteca'::character varying)::text])`),
])

export const periodosAcademicos = pgTable("periodos_academicos", {
  periodoAcademicoId: uuid("periodo_academico_id").primaryKey().notNull(),
  codigoPeriodoAcademico: varchar("codigo_periodo_academico", { length: 40 }).notNull(),
  fechaInicioPeriodo: date("fecha_inicio_periodo").notNull(),
  fechaFinPeriodo: date("fecha_fin_periodo").notNull(),
  cantidadSemanasLectivas: smallint("cantidad_semanas_lectivas").default(sql`'16'`).notNull(),
}, (table) => [
  unique("periodos_academicos_codigo_unico").on(table.codigoPeriodoAcademico),
  check("periodos_academicos_fechas_check", sql`fecha_fin_periodo >= fecha_inicio_periodo`),
  check("periodos_academicos_semanas_lectivas_rango", sql`(cantidad_semanas_lectivas >= 1) AND (cantidad_semanas_lectivas <= 52)`),
])

export const mensajesIaPlantilla = pgTable("mensajes_ia_plantilla", {
  mensajeIaPlantillaId: uuid("mensaje_ia_plantilla_id").primaryKey().notNull(),
  plantillaId: uuid("plantilla_id").notNull(),
  usuarioId: uuid("usuario_id").notNull(),
  contenidoMensaje: jsonb("contenido_mensaje").notNull(),
  enviadoEn: timestamp("enviado_en", { precision: 6, withTimezone: true, mode: "string" }).default(sql`clock_timestamp()`).notNull(),
  ocultadoEn: timestamp("ocultado_en", { precision: 6, withTimezone: true, mode: "string" }),
}, (table) => [
  uniqueIndex("mensajes_ia_plantilla_idempotencia_unica").using("btree", table.plantillaId, table.usuarioId, sql`((contenido_mensaje -> 'entrada'::text) ->> 'clave_idempotencia'::text)`).where(sql`((contenido_mensaje ->> 'rol'::text) = 'usuario'::text)`),
  index().using("btree", table.plantillaId, table.usuarioId, table.enviadoEn),
  index().using("btree", table.usuarioId),
  foreignKey({
      columns: [table.plantillaId],
      foreignColumns: [plantillaSilabo.plantillaId],
      name: "mensajes_ia_plantilla_plantilla_id_foreign"
    }).onDelete("cascade"),
  foreignKey({
      columns: [table.usuarioId],
      foreignColumns: [usuarios.usuarioId],
      name: "mensajes_ia_plantilla_usuario_id_foreign"
    }).onDelete("restrict"),
  check("mensajes_ia_plantilla_contenido_check", sql`(jsonb_typeof(contenido_mensaje) = 'object'::text) AND ((contenido_mensaje ->> 'rol'::text) = ANY (ARRAY['usuario'::text, 'asistente'::text])) AND ((contenido_mensaje ->> 'estado'::text) = ANY (ARRAY['pendiente'::text, 'en_ejecucion'::text, 'completado'::text, 'fallido'::text]))`),
])

export const plantillaSilabo = pgTable("plantilla_silabo", {
  plantillaId: uuid("plantilla_id").primaryKey().notNull(),
  plantillaModificadaEn: timestamp("plantilla_modificada_en", { precision: 6, withTimezone: true, mode: "string" }),
  definicionPlantilla: json("definicion_plantilla").default({}).notNull(),
}, () => [
  uniqueIndex("plantilla_silabo_unica").using("btree", sql`(true)`),
  check("definicion_plantilla_objeto", sql`json_typeof(definicion_plantilla) = 'object'::text`),
])

export const propuestasIaPlantilla = pgTable("propuestas_ia_plantilla", {
  propuestaIaPlantillaId: uuid("propuesta_ia_plantilla_id").primaryKey().notNull(),
  plantillaId: uuid("plantilla_id").notNull(),
  mensajeIaPlantillaId: uuid("mensaje_ia_plantilla_id").notNull(),
  solicitadaPor: uuid("solicitada_por").notNull(),
  estructuraPropuesta: jsonb("estructura_propuesta").notNull(),
  cambiosPropuesta: jsonb("cambios_propuesta").notNull(),
  huellaPlantillaBase: char("huella_plantilla_base", { length: 64 }).notNull(),
  versionBorradorPropuesta: varchar("version_borrador_propuesta", { length: 100 }).notNull(),
  estadoPropuesta: varchar("estado_propuesta", { length: 20 }).default("pendiente").notNull(),
  decididaPor: uuid("decidida_por"),
  decididaEn: timestamp("decidida_en", { precision: 6, withTimezone: true, mode: "string" }),
  creadaEn: timestamp("creada_en", { precision: 6, withTimezone: true, mode: "string" }).default(sql`clock_timestamp()`).notNull(),
}, (table) => [
  index().using("btree", table.decididaPor),
  index().using("btree", table.plantillaId, table.estadoPropuesta),
  index().using("btree", table.solicitadaPor),
  foreignKey({
      columns: [table.decididaPor],
      foreignColumns: [usuarios.usuarioId],
      name: "propuestas_ia_plantilla_decidida_por_foreign"
    }).onDelete("restrict"),
  foreignKey({
      columns: [table.mensajeIaPlantillaId],
      foreignColumns: [mensajesIaPlantilla.mensajeIaPlantillaId],
      name: "propuestas_ia_plantilla_mensaje_ia_plantilla_id_foreign"
    }).onDelete("cascade"),
  foreignKey({
      columns: [table.plantillaId],
      foreignColumns: [plantillaSilabo.plantillaId],
      name: "propuestas_ia_plantilla_plantilla_id_foreign"
    }).onDelete("cascade"),
  foreignKey({
      columns: [table.solicitadaPor],
      foreignColumns: [usuarios.usuarioId],
      name: "propuestas_ia_plantilla_solicitada_por_foreign"
    }).onDelete("restrict"),
  unique("propuestas_ia_plantilla_mensaje_ia_plantilla_id_unique").on(table.mensajeIaPlantillaId),
  check("propuestas_ia_plantilla_decision_check", sql`((estado_propuesta)::text <> ALL (ARRAY[('aplicada'::character varying)::text, ('descartada'::character varying)::text])) OR ((decidida_por IS NOT NULL) AND (decidida_en IS NOT NULL))`),
  check("propuestas_ia_plantilla_estado_check", sql`(estado_propuesta)::text = ANY (ARRAY[('pendiente'::character varying)::text, ('aplicada'::character varying)::text, ('descartada'::character varying)::text, ('vencida'::character varying)::text, ('reemplazada'::character varying)::text])`),
  check("propuestas_ia_plantilla_huella_check", sql`huella_plantilla_base ~ '^[0-9a-f]{64}$'::text`),
])

export const restablecimientosContrasena = pgTable("restablecimientos_contrasena", {
  email: varchar({ length: 255 }).primaryKey().notNull(),
  token: varchar({ length: 255 }).notNull(),
  createdAt: timestamp("created_at", { precision: 0, withTimezone: true, mode: "string" }),
})

export const usuarios = pgTable("usuarios", {
  usuarioId: uuid("usuario_id").primaryKey().notNull(),
  nombreUsuario: varchar("nombre_usuario", { length: 255 }).notNull(),
  correoElectronico: varchar("correo_electronico", { length: 255 }).notNull(),
  correoVerificadoEn: timestamp("correo_verificado_en", { precision: 0, withTimezone: true, mode: "string" }),
  contrasena: varchar({ length: 255 }).notNull(),
  usuarioActivo: boolean("usuario_activo").default(true).notNull(),
  codigoRecordarme: varchar("codigo_recordarme", { length: 100 }),
  secretoDosFactores: text("secreto_dos_factores"),
  codigosRecuperacionDosFactores: text("codigos_recuperacion_dos_factores"),
  dosFactoresConfirmadoEn: timestamp("dos_factores_confirmado_en", { precision: 0, withTimezone: true, mode: "string" }),
  formacionExperienciaUsuario: text("formacion_experiencia_usuario"),
  preferenciasAccesibilidadUsuario: jsonb("preferencias_accesibilidad_usuario"),
  preferenciasCorreoUsuario: jsonb("preferencias_correo_usuario"),
}, (table) => [
  index().using("btree", table.usuarioActivo),
  unique("usuarios_correo_electronico_unique").on(table.correoElectronico),
])

export const revisionesCoordinacion = pgTable("revisiones_coordinacion", {
  revisionCoordinacionId: uuid("revision_coordinacion_id").primaryKey().notNull(),
  revisionSilaboId: uuid("revision_silabo_id").notNull(),
  revisadoPor: uuid("revisado_por").notNull(),
  revisadoEn: timestamp("revisado_en", { withTimezone: true, mode: "string" }).notNull(),
}, (table) => [
  index().using("btree", table.revisadoPor),
  foreignKey({
      columns: [table.revisadoPor],
      foreignColumns: [usuarios.usuarioId],
      name: "revisiones_coordinacion_revisado_por_fkey"
    }).onDelete("restrict"),
  foreignKey({
      columns: [table.revisionSilaboId],
      foreignColumns: [revisionesSilabo.revisionSilaboId],
      name: "revisiones_coordinacion_revision_silabo_id_fkey"
    }).onDelete("restrict"),
  unique("revisiones_coordinacion_revision_unica").on(table.revisionSilaboId),
])

export const valoresCampo = pgTable("valores_campo", {
  valorCampoId: uuid("valor_campo_id").primaryKey().notNull(),
  silaboId: uuid("silabo_id"),
  definicionCampoId: uuid("definicion_campo_id").notNull(),
  valorCampo: jsonb("valor_campo"),
  asignaturaId: uuid("asignatura_id"),
}, (table) => [
  uniqueIndex("valores_campo_asignatura_definicion_unica").using("btree", table.asignaturaId, table.definicionCampoId).where(sql`(asignatura_id IS NOT NULL)`),
  index().using("btree", table.definicionCampoId),
  uniqueIndex("valores_campo_silabo_definicion_unica").using("btree", table.silaboId, table.definicionCampoId).where(sql`(silabo_id IS NOT NULL)`),
  foreignKey({
      columns: [table.asignaturaId],
      foreignColumns: [asignaturas.asignaturaId],
      name: "valores_campo_asignatura_id_foreign"
    }).onDelete("cascade"),
  foreignKey({
      columns: [table.definicionCampoId],
      foreignColumns: [definicionesCampo.definicionCampoId],
      name: "valores_campo_definicion_campo_id_foreign"
    }).onDelete("restrict"),
  foreignKey({
      columns: [table.silaboId],
      foreignColumns: [silabos.silaboId],
      name: "valores_campo_silabo_id_foreign"
    }).onDelete("cascade"),
  check("valores_campo_un_solo_dueno_check", sql`(silabo_id IS NULL) <> (asignatura_id IS NULL)`),
])

export const sesiones = pgTable("sesiones", {
  id: varchar({ length: 255 }).primaryKey().notNull(),
  userId: uuid("user_id"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  payload: text().notNull(),
  lastActivity: integer("last_activity").notNull(),
}, (table) => [
  index().using("btree", table.lastActivity),
  index().using("btree", table.userId),
  foreignKey({
      columns: [table.userId],
      foreignColumns: [usuarios.usuarioId],
      name: "sesiones_user_id_foreign"
    }).onDelete("set null"),
])

export const requisitosAsignatura = pgTable("requisitos_asignatura", {
  requisitoAsignaturaId: uuid("requisito_asignatura_id").primaryKey().notNull(),
  asignaturaId: uuid("asignatura_id").notNull(),
  requisitoId: uuid("requisito_id").notNull(),
  tipoRequisitoAsignatura: varchar("tipo_requisito_asignatura", { length: 30 }).default("prerrequisito").notNull(),
}, (table) => [
  index().using("btree", table.requisitoId),
  foreignKey({
      columns: [table.asignaturaId],
      foreignColumns: [asignaturas.asignaturaId],
      name: "requisitos_asignatura_asignatura_id_foreign"
    }).onDelete("restrict"),
  foreignKey({
      columns: [table.requisitoId],
      foreignColumns: [asignaturas.asignaturaId],
      name: "requisitos_asignatura_requisito_id_foreign"
    }).onDelete("restrict"),
  unique("requisitos_asignatura_par_unico").on(table.asignaturaId, table.requisitoId),
  check("requisitos_asignatura_distintos_check", sql`asignatura_id <> requisito_id`),
  check("requisitos_asignatura_tipo_check", sql`(tipo_requisito_asignatura)::text = ANY (ARRAY[('prerrequisito'::character varying)::text, ('correquisito'::character varying)::text])`),
])

export const revisionesSilabo = pgTable("revisiones_silabo", {
  revisionSilaboId: uuid("revision_silabo_id").primaryKey().notNull(),
  silaboId: uuid("silabo_id").notNull(),
  revisionAnteriorId: uuid("revision_anterior_id"),
  numeroRevision: smallint("numero_revision").notNull(),
  claveSolicitud: uuid("clave_solicitud").notNull(),
  versionBorrador: integer("version_borrador").notNull(),
  contenidoEnviado: jsonb("contenido_enviado").notNull(),
  hashContenido: char("hash_contenido", { length: 64 }).notNull(),
  enviadoPor: uuid("enviado_por").notNull(),
  enviadoEn: timestamp("enviado_en", { precision: 0, withTimezone: true, mode: "string" }).notNull(),
  correccionJustificacion: text("correccion_justificacion"),
  correccionEtapa: varchar("correccion_etapa", { length: 16 }),
  correccionSolicitadaPor: uuid("correccion_solicitada_por"),
  correccionSolicitadaEn: timestamp("correccion_solicitada_en", { withTimezone: true, mode: "string" }),
}, (table) => [
  index().using("btree", table.correccionSolicitadaPor),
  index().using("btree", table.enviadoPor),
  index().using("btree", table.revisionAnteriorId),
  index().using("btree", table.silaboId, table.enviadoEn),
  foreignKey({
      columns: [table.correccionSolicitadaPor],
      foreignColumns: [usuarios.usuarioId],
      name: "revisiones_silabo_correccion_solicitada_por_foreign"
    }).onDelete("restrict"),
  foreignKey({
      columns: [table.enviadoPor],
      foreignColumns: [usuarios.usuarioId],
      name: "revisiones_silabo_enviado_por_foreign"
    }).onDelete("restrict"),
  foreignKey({
      columns: [table.revisionAnteriorId],
      foreignColumns: [table.revisionSilaboId],
      name: "revisiones_silabo_revision_anterior_id_foreign"
    }).onDelete("restrict"),
  foreignKey({
      columns: [table.silaboId],
      foreignColumns: [silabos.silaboId],
      name: "revisiones_silabo_silabo_id_foreign"
    }).onDelete("restrict"),
  unique("revisiones_silabo_silabo_id_clave_solicitud_unique").on(table.silaboId, table.claveSolicitud),
  unique("revisiones_silabo_silabo_id_numero_revision_unique").on(table.silaboId, table.numeroRevision),
  check("revisiones_silabo_correccion_completa_check", sql`((correccion_justificacion IS NULL) AND (correccion_etapa IS NULL) AND (correccion_solicitada_por IS NULL) AND (correccion_solicitada_en IS NULL)) OR ((correccion_justificacion IS NOT NULL) AND (correccion_etapa IS NOT NULL) AND (correccion_solicitada_por IS NOT NULL) AND (correccion_solicitada_en IS NOT NULL))`),
  check("revisiones_silabo_correccion_etapa_check", sql`(correccion_etapa)::text = ANY (ARRAY[('biblioteca'::character varying)::text, ('coordinacion'::character varying)::text])`),
])

export const seccionesPlantilla = pgTable("secciones_plantilla", {
  seccionPlantillaId: uuid("seccion_plantilla_id").primaryKey().notNull(),
  plantillaId: uuid("plantilla_id").notNull(),
  claveSeccionPlantilla: varchar("clave_seccion_plantilla", { length: 120 }).notNull(),
  tituloSeccionPlantilla: varchar("titulo_seccion_plantilla", { length: 180 }).notNull(),
  posicionSeccionPlantilla: smallint("posicion_seccion_plantilla").notNull(),
  vigenteEnPlantilla: boolean("vigente_en_plantilla").default(true).notNull(),
  orientacionSeccionPlantilla: varchar("orientacion_seccion_plantilla", { length: 12 }).default("portrait").notNull(),
}, (table) => [
  index("secciones_plantilla_plantilla_id_posicion_index").using("btree", table.plantillaId, table.posicionSeccionPlantilla),
  uniqueIndex("secciones_plantilla_vigente_clave_unica").using("btree", table.plantillaId, table.claveSeccionPlantilla).where(sql`vigente_en_plantilla`),
  foreignKey({
      columns: [table.plantillaId],
      foreignColumns: [plantillaSilabo.plantillaId],
      name: "secciones_plantilla_plantilla_id_foreign"
    }).onDelete("cascade"),
  unique("secciones_plantilla_id_plantilla_unica").on(table.seccionPlantillaId, table.plantillaId),
  check("secciones_plantilla_orientacion_check", sql`(orientacion_seccion_plantilla)::text = ANY (ARRAY[('portrait'::character varying)::text, ('landscape'::character varying)::text])`),
])
