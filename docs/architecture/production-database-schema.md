# Base de datos actual de producción — Sílabos UEB

**Fotografía verificada:** 15 de septiembre de 2026, migraciones hasta
`2026_09_15_000072_store_fixed_role_on_role_assignments` (lote 45).
# 1. Identidad y acceso

## usuarios

**Contexto:** cuentas de administrador, coordinador y docente.

~~~text
id UUID (PK)
nombre_usuario VARCHAR NOT NULL
correo_electronico VARCHAR NOT NULL UNIQUE
correo_verificado_en TIMESTAMPTZ NULL
contrasena VARCHAR NOT NULL
usuario_activo BOOLEAN NOT NULL
codigo_recordarme VARCHAR NULL
secreto_dos_factores TEXT NULL
codigos_recuperacion_dos_factores TEXT NULL
dos_factores_confirmado_en TIMESTAMPTZ NULL
debe_cambiar_contrasena BOOLEAN NOT NULL
~~~

## asignaciones_rol

**Contexto:** rol fijo otorgado a un usuario, global o por carrera.

~~~text
id UUID (PK)
usuario_id UUID (FK → usuarios.id) NOT NULL
rol VARCHAR NOT NULL
carrera_id UUID (FK → carreras.id) NULL
asignacion_rol_activa BOOLEAN NOT NULL
asignado_en TIMESTAMPTZ NULL

CHECK (rol IN ('administrador', 'coordinador', 'docente'))
CHECK (administrador sin carrera; coordinador/docente con carrera)
UNIQUE parcial: usuario_id, rol y carrera_id cuando asignacion_rol_activa
~~~

**Regla adicional:** un trigger de PostgreSQL permite una sola coordinación ejercible
por carrera: rol `coordinador` activo y cuenta activa.

## asignaciones_paralelo

**Contexto:** responsabilidad docente sobre un paralelo, respaldada por un rol docente
de la misma carrera.

~~~text
id UUID (PK)
asignacion_rol_id UUID (FK → asignaciones_rol.id) NOT NULL
paralelo_id UUID (FK → paralelos.id) NOT NULL
docente_paralelo_activo BOOLEAN NOT NULL
asignado_en TIMESTAMPTZ NULL

UNIQUE (asignacion_rol_id, paralelo_id)
~~~

## sesiones

**Contexto:** sesión web de Laravel.

~~~text
id VARCHAR (PK)
user_id UUID (FK → usuarios.id) NULL
ip_address VARCHAR NULL
user_agent TEXT NULL
payload TEXT NOT NULL
last_activity INTEGER NOT NULL
~~~

## restablecimientos_contrasena

**Contexto:** tokens de recuperación.

~~~text
email VARCHAR (PK)
token VARCHAR NOT NULL
created_at TIMESTAMPTZ NULL
~~~

### Cardinalidades

~~~text
usuarios N:M carreras por roles con alcance en asignaciones_rol
asignaciones_rol (docente) 1:N asignaciones_paralelo
paralelos 1:N asignaciones_paralelo
usuarios 1:N sesiones
~~~

---

# 2. Estructura académica

## facultades

**Contexto:** facultades institucionales.

~~~text
id UUID (PK)
codigo_facultad VARCHAR NULL UNIQUE
nombre_facultad VARCHAR NOT NULL
facultad_activa BOOLEAN NOT NULL
ruta_logo_facultad VARCHAR NULL
~~~

## campus

**Contexto:** sedes institucionales.

~~~text
id UUID (PK)
codigo_campus VARCHAR NULL UNIQUE
nombre_campus VARCHAR NOT NULL
campus_activo BOOLEAN NOT NULL
~~~

## carreras

**Contexto:** carreras académicas.

~~~text
id UUID (PK)
facultad_id UUID (FK → facultades.id) NOT NULL
codigo_carrera VARCHAR NULL UNIQUE
nombre_carrera VARCHAR NOT NULL
carrera_activa BOOLEAN NOT NULL
campus_id UUID (FK → campus.id) NULL
modalidad_carrera VARCHAR NULL
~~~

## periodos_academicos

**Contexto:** períodos lectivos.

~~~text
id UUID (PK)
codigo_periodo_academico VARCHAR NOT NULL UNIQUE
fecha_inicio_periodo DATE NOT NULL
fecha_fin_periodo DATE NOT NULL
cantidad_semanas_lectivas SMALLINT NOT NULL
~~~

## mallas

**Contexto:** malla curricular de una carrera.

~~~text
id UUID (PK)
carrera_id UUID (FK → carreras.id) NOT NULL
codigo_malla VARCHAR NOT NULL
estado_malla VARCHAR NOT NULL
cantidad_ciclos_malla SMALLINT NOT NULL

UNIQUE (carrera_id)
UNIQUE (carrera_id, codigo_malla)
~~~

## asignaturas

**Contexto:** materias de una malla.

~~~text
id UUID (PK)
malla_id UUID (FK → mallas.id) NOT NULL
codigo_asignatura VARCHAR NOT NULL
nombre_asignatura VARCHAR NOT NULL
ciclo_asignatura SMALLINT NULL
creditos_asignatura NUMERIC NULL
total_horas_asignatura SMALLINT NULL
asignatura_activa BOOLEAN NOT NULL
horas_proyecto NUMERIC NULL
horas_ap NUMERIC NULL
horas_ac NUMERIC NULL
horas_pae NUMERIC NULL
horas_aa NUMERIC NULL
horas_paec NUMERIC NULL
orden_asignatura_en_ciclo SMALLINT NOT NULL
unidad_organizativa_curricular_asignatura VARCHAR NULL
modalidad_asignatura VARCHAR NULL

UNIQUE (malla_id, codigo_asignatura)
~~~

## requisitos_asignatura

**Contexto:** relación de requisito entre dos asignaturas.

~~~text
id UUID (PK)
asignatura_id UUID (FK → asignaturas.id) NOT NULL
requisito_id UUID (FK → asignaturas.id) NOT NULL
tipo_requisito_asignatura VARCHAR NOT NULL

UNIQUE (asignatura_id, requisito_id, tipo_requisito_asignatura)
~~~

## programaciones_asignatura

**Contexto:** oferta de una asignatura en período y campus.

~~~text
id UUID (PK)
periodo_academico_id UUID (FK → periodos_academicos.id) NOT NULL
asignatura_id UUID (FK → asignaturas.id) NOT NULL
campus_id UUID (FK → campus.id) NOT NULL
programacion_asignatura_activa BOOLEAN NOT NULL
modalidad_programacion_asignatura VARCHAR NOT NULL

UNIQUE (periodo_academico_id, asignatura_id)
~~~

## paralelos

**Contexto:** paralelos de una programación.

~~~text
id UUID (PK)
programacion_asignatura_id UUID (FK → programaciones_asignatura.id) NOT NULL
codigo_paralelo VARCHAR NOT NULL
paralelo_activo BOOLEAN NOT NULL
jornada_paralelo VARCHAR NULL

UNIQUE (programacion_asignatura_id, codigo_paralelo)
~~~

### Cardinalidades

~~~text
facultades 1:N carreras
campus 1:N carreras
carreras 1:0..1 mallas
mallas 1:N asignaturas
asignaturas 1:N requisitos_asignatura, como asignatura y como requisito
periodos_academicos 1:N programaciones_asignatura
asignaturas 1:N programaciones_asignatura
campus 1:N programaciones_asignatura
programaciones_asignatura 1:N paralelos
~~~

---

# 3. Plantilla institucional y fuentes

## plantillas_silabo

**Contexto:** plantilla institucional que define el documento de sílabo.

~~~text
id UUID (PK)
nombre_plantilla_silabo VARCHAR NOT NULL
descripcion_plantilla_silabo TEXT NULL
plantilla_silabo_activa BOOLEAN NOT NULL
mapeo_documento_plantilla JSONB NULL

UNIQUE constante: existe solo una plantilla
~~~

## secciones_plantilla

**Contexto:** secciones principales de la plantilla.

~~~text
id UUID (PK)
clave_seccion_plantilla VARCHAR NOT NULL
titulo_seccion_plantilla VARCHAR NOT NULL
descripcion_seccion_plantilla TEXT NULL
posicion_seccion_plantilla SMALLINT NOT NULL
plantilla_id UUID (FK → plantillas_silabo.id) NOT NULL

UNIQUE (plantilla_id, clave_seccion_plantilla)
UNIQUE (plantilla_id, posicion_seccion_plantilla)
~~~

## bloques_plantilla

**Contexto:** agrupaciones de campos dentro de una sección.

~~~text
id UUID (PK)
seccion_plantilla_id UUID (FK → secciones_plantilla.id) NOT NULL
clave_bloque_plantilla VARCHAR NOT NULL
tipo_bloque_plantilla VARCHAR NOT NULL
titulo_bloque_plantilla VARCHAR NOT NULL
configuracion_bloque_plantilla JSONB NULL
posicion_bloque_plantilla SMALLINT NOT NULL
plantilla_id UUID (FK → plantillas_silabo.id) NOT NULL

UNIQUE (plantilla_id, clave_bloque_plantilla)
UNIQUE (seccion_plantilla_id, posicion_bloque_plantilla)
~~~

## definiciones_campo

**Contexto:** definición de cada campo del sílabo, sus reglas y configuración IA.

~~~text
id UUID (PK)
bloque_plantilla_id UUID (FK → bloques_plantilla.id) NOT NULL
clave_definicion_campo VARCHAR NOT NULL
etiqueta_definicion_campo VARCHAR NOT NULL
ayuda_definicion_campo TEXT NULL
tipo_definicion_campo VARCHAR NOT NULL
obligatorio BOOLEAN NOT NULL
heredado BOOLEAN NOT NULL
origen_maestro VARCHAR NULL
editable_docente BOOLEAN NOT NULL
ia_habilitada BOOLEAN NOT NULL
reglas_definicion_campo JSONB NULL
opciones_definicion_campo JSONB NULL
marcador_documento VARCHAR NULL
posicion_definicion_campo SMALLINT NOT NULL
plantilla_id UUID (FK → plantillas_silabo.id) NOT NULL

UNIQUE (plantilla_id, clave_definicion_campo)
UNIQUE (bloque_plantilla_id, posicion_definicion_campo)
~~~

## fuentes_academicas

**Contexto:** fuentes Markdown de una carrera, seleccionables para IA.

~~~text
id UUID (PK)
carrera_id UUID (FK → carreras.id) NOT NULL
nombre_fuente_academica VARCHAR NOT NULL
descripcion_fuente_academica TEXT NULL
fuente_academica_activa BOOLEAN NOT NULL
contenido_fuente_academica TEXT NULL

UNIQUE (carrera_id, nombre_fuente_academica)
~~~

### Cardinalidades

~~~text
plantillas_silabo 1:N secciones_plantilla
plantillas_silabo 1:N bloques_plantilla
secciones_plantilla 1:N bloques_plantilla
plantillas_silabo 1:N definiciones_campo
bloques_plantilla 1:N definiciones_campo
carreras 1:N fuentes_academicas
~~~

Las dependencias desde plantilla, sección y bloque se eliminan en cascada.

---

# 4. Convocatorias y borradores

## convocatorias_universidad

**Contexto:** proceso universitario de elaboración por período.

~~~text
id UUID (PK)
inicia_en TIMESTAMPTZ NOT NULL
entrega_en TIMESTAMPTZ NOT NULL
estado_convocatoria_universidad VARCHAR NOT NULL
plantilla_id UUID (FK → plantillas_silabo.id) NOT NULL
periodo_academico_id UUID (FK → periodos_academicos.id) NOT NULL

UNIQUE (periodo_academico_id)
UNIQUE parcial: una convocatoria abierta o pausada
~~~

## convocatorias_carreras

**Contexto:** participación de una carrera en una convocatoria.

~~~text
id UUID (PK)
carrera_id UUID (FK → carreras.id) NOT NULL
estado_convocatoria_carrera VARCHAR NOT NULL
proceso_id UUID (FK → convocatorias_universidad.id) NOT NULL

UNIQUE (carrera_id, proceso_id)
~~~

## fuentes_convocatoria

**Contexto:** fuentes habilitadas en una convocatoria de carrera.

~~~text
id UUID (PK)
convocatoria_id UUID (FK → convocatorias_carreras.id) NOT NULL
fuente_academica_id UUID (FK → fuentes_academicas.id) NOT NULL

UNIQUE (convocatoria_id, fuente_academica_id)
~~~

## fechas_limite_convocatoria

**Contexto:** vencimiento por etapa.

~~~text
id UUID (PK)
convocatoria_id UUID (FK → convocatorias_carreras.id) NOT NULL
etapa_fecha_limite_convocatoria VARCHAR NOT NULL
vence_en TIMESTAMPTZ NOT NULL

UNIQUE (convocatoria_id, etapa_fecha_limite_convocatoria)
~~~

## silabos

**Contexto:** borrador vivo de un sílabo.

~~~text
id UUID (PK)
convocatoria_id UUID (FK → convocatorias_carreras.id) NOT NULL
asignatura_id UUID (FK → asignaturas.id) NOT NULL
malla_id UUID (FK → mallas.id) NOT NULL
estado_silabo VARCHAR NOT NULL
version_bloqueo INTEGER NOT NULL
porcentaje_completitud NUMERIC NOT NULL
iniciado_en TIMESTAMPTZ NULL
guardado_en TIMESTAMPTZ NULL
contexto_academico_silabo JSONB NOT NULL
plantilla_id UUID (FK → plantillas_silabo.id) NOT NULL
~~~

## alcances_silabo

**Contexto:** paralelos cubiertos por un sílabo.

~~~text
id UUID (PK)
silabo_id UUID (FK → silabos.id) NOT NULL
convocatoria_id UUID (FK → convocatorias_carreras.id) NOT NULL
programacion_asignatura_id UUID (FK → programaciones_asignatura.id) NOT NULL
paralelo_id UUID (FK → paralelos.id) NOT NULL

UNIQUE (convocatoria_id, paralelo_id)
UNIQUE (silabo_id, paralelo_id)
~~~

## colaboradores_silabo

**Contexto:** docentes colaboradores de un sílabo.

~~~text
id UUID (PK)
silabo_id UUID (FK → silabos.id) NOT NULL
usuario_id UUID (FK → usuarios.id) NOT NULL
docente_paralelo_id UUID (FK → asignaciones_paralelo.id) NOT NULL

UNIQUE (silabo_id, docente_paralelo_id)
~~~

## valores_campo

**Contexto:** valor no repetible de un campo dentro de un sílabo.

~~~text
id UUID (PK)
silabo_id UUID (FK → silabos.id) NOT NULL
definicion_campo_id UUID (FK → definiciones_campo.id) NOT NULL
valor_campo JSONB NULL
heredado BOOLEAN NOT NULL
origen_valor_campo VARCHAR NULL

UNIQUE (silabo_id, definicion_campo_id)
~~~

## filas_repetibles

**Contexto:** filas ordenadas de campos tipo tabla o repetibles.

~~~text
id UUID (PK)
silabo_id UUID (FK → silabos.id) NOT NULL
definicion_campo_id UUID (FK → definiciones_campo.id) NOT NULL
datos_fila_repetible JSONB NOT NULL
posicion_fila_repetible SMALLINT NOT NULL

UNIQUE (silabo_id, definicion_campo_id, posicion_fila_repetible)
~~~

## ejecuciones_validacion

**Contexto:** validación determinística de un borrador.

~~~text
id UUID (PK)
silabo_id UUID (FK → silabos.id) NOT NULL
ejecutado_por UUID (FK → usuarios.id) NOT NULL
version_reglas VARCHAR NOT NULL
estado_ejecucion_validacion VARCHAR NOT NULL
version_bloqueo INTEGER NOT NULL
errores_bloqueantes SMALLINT NOT NULL
cantidad_advertencias_validacion SMALLINT NOT NULL
porcentaje_completitud NUMERIC NOT NULL
completado_en TIMESTAMPTZ NOT NULL
~~~

## resultados_validacion

**Contexto:** detalle de un error o advertencia.

~~~text
id UUID (PK)
ejecucion_validacion_id UUID (FK → ejecuciones_validacion.id) NOT NULL
definicion_campo_id UUID (FK → definiciones_campo.id) NULL
codigo_resultado_validacion VARCHAR NOT NULL
severidad_resultado_validacion VARCHAR NOT NULL
mensaje_resultado_validacion VARCHAR NOT NULL
~~~

### Cardinalidades

~~~text
periodos_academicos 1:0..1 convocatorias_universidad
plantillas_silabo 1:N convocatorias_universidad
convocatorias_universidad 1:N convocatorias_carreras
carreras 1:N convocatorias_carreras
convocatorias_carreras N:M fuentes_academicas mediante fuentes_convocatoria
convocatorias_carreras 1:N fechas_limite_convocatoria
convocatorias_carreras 1:N silabos
silabos N:M paralelos mediante alcances_silabo
silabos N:M usuarios mediante colaboradores_silabo
silabos N:M definiciones_campo mediante valores_campo
silabos 1:N filas_repetibles
silabos 1:N ejecuciones_validacion
ejecuciones_validacion 1:N resultados_validacion
~~~

Los hijos directos de sílabo (alcances, colaboradores, valores, filas y validaciones)
tienen borrado en cascada.

---

# 5. IA explicable

## ejecuciones_trabajo

**Contexto:** seguimiento asíncrono genérico de IA, exportaciones y otros trabajos.

~~~text
id UUID (PK)
tipo_ejecucion_trabajo VARCHAR NOT NULL
estado_ejecucion_trabajo VARCHAR NOT NULL
clave_idempotencia VARCHAR NOT NULL UNIQUE
correlacion_id UUID NULL
intentos SMALLINT NOT NULL
progreso SMALLINT NOT NULL
resultado_ejecucion_trabajo JSONB NULL
codigo_error VARCHAR NULL
mensaje_error TEXT NULL
iniciado_en TIMESTAMPTZ NULL
finalizado_en TIMESTAMPTZ NULL
encolado_en TIMESTAMPTZ NULL
cola VARCHAR NOT NULL
tipo_recurso VARCHAR NULL
recurso_id UUID NULL
intentos_maximos SMALLINT NOT NULL
~~~

## ejecuciones_ia

**Contexto:** una solicitud de IA sobre un campo de un sílabo.

~~~text
id UUID (PK)
silabo_id UUID (FK → silabos.id) NOT NULL
definicion_campo_id UUID (FK → definiciones_campo.id) NOT NULL
ejecucion_trabajo_id UUID (FK → ejecuciones_trabajo.id) NULL UNIQUE
clave_idempotencia UUID NOT NULL
clave_funcional CHAR(64) NOT NULL
estado_ejecucion_ia VARCHAR NOT NULL
version_contrato VARCHAR NOT NULL
version_instruccion VARCHAR NOT NULL
version_pasarela_solicitada VARCHAR NOT NULL
version_pasarela_ejecutada VARCHAR NULL
idioma VARCHAR NOT NULL
contenido_entrada_ia TEXT NOT NULL
huella_contenido CHAR(64) NOT NULL
huella_conjunto_fuentes CHAR(64) NOT NULL
metadatos_entrada_ia JSONB NOT NULL
version_bloqueo_origen INTEGER NOT NULL
motivo_no_concluyente VARCHAR NULL
codigo_error VARCHAR NULL
mensaje_error TEXT NULL
solicitado_por UUID (FK → usuarios.id) NOT NULL
asignacion_rol_id UUID (FK → asignaciones_rol.id) NULL
solicitado_en TIMESTAMPTZ NOT NULL
iniciado_en TIMESTAMPTZ NULL
completado_en TIMESTAMPTZ NULL
plantilla_id UUID (FK → plantillas_silabo.id) NOT NULL

UNIQUE (silabo_id, definicion_campo_id, clave_idempotencia)
UNIQUE parcial sobre clave_funcional
~~~

## evidencias_ia

**Contexto:** extractos de fuente que respaldan una ejecución IA.

~~~text
id UUID (PK)
ejecucion_ia_id UUID (FK → ejecuciones_ia.id) NOT NULL
fuente_academica_id UUID (FK → fuentes_academicas.id) NOT NULL
nombre_fuente VARCHAR NOT NULL
extracto_evidencia_ia TEXT NOT NULL
huella_contenido CHAR(64) NOT NULL
~~~

## recomendaciones_ia

**Contexto:** recomendaciones generadas para un campo.

~~~text
id UUID (PK)
ejecucion_ia_id UUID (FK → ejecuciones_ia.id) NOT NULL
definicion_campo_id UUID (FK → definiciones_campo.id) NOT NULL
ordinal SMALLINT NOT NULL
tipo_recomendacion_ia VARCHAR NOT NULL
titulo_recomendacion_ia VARCHAR NOT NULL
explicacion_recomendacion_ia TEXT NOT NULL
texto_sugerido TEXT NOT NULL

UNIQUE (ejecucion_ia_id, ordinal)
~~~

## recomendacion_evidencias_ia

**Contexto:** evidencia usada por cada recomendación.

~~~text
id UUID (PK)
recomendacion_ia_id UUID (FK → recomendaciones_ia.id) NOT NULL
evidencia_ia_id UUID (FK → evidencias_ia.id) NOT NULL

UNIQUE (recomendacion_ia_id, evidencia_ia_id)
~~~

## retroalimentacion_ia

**Contexto:** decisión humana respecto de una recomendación IA.

~~~text
id UUID (PK)
recomendacion_ia_id UUID (FK → recomendaciones_ia.id) NOT NULL
usuario_id UUID (FK → usuarios.id) NOT NULL
asignacion_rol_id UUID (FK → asignaciones_rol.id) NULL
decision_retroalimentacion_ia VARCHAR NOT NULL
contenido_anterior_retroalimentacion_ia TEXT NULL
contenido_posterior_retroalimentacion_ia TEXT NULL
version_bloqueo_origen INTEGER NULL
version_bloqueo_resultado INTEGER NULL
decidido_en TIMESTAMPTZ NOT NULL

UNIQUE (recomendacion_ia_id, usuario_id, decision_retroalimentacion_ia)
UNIQUE parcial: una sola decisión aplicada por recomendación
~~~

### Cardinalidades

~~~text
silabos 1:N ejecuciones_ia
definiciones_campo 1:N ejecuciones_ia
ejecuciones_trabajo 1:0..1 ejecuciones_ia
ejecuciones_ia 1:N evidencias_ia
fuentes_academicas 1:N evidencias_ia
ejecuciones_ia 1:N recomendaciones_ia
recomendaciones_ia N:M evidencias_ia mediante recomendacion_evidencias_ia
recomendaciones_ia 1:N retroalimentacion_ia
~~~

---

# 6. Revisión, aprobación y corrección

## revisiones_silabo

**Contexto:** fotografía inmutable enviada para revisión.

~~~text
id UUID (PK)
silabo_id UUID (FK → silabos.id) NOT NULL
revision_anterior_id UUID (FK → revisiones_silabo.id) NULL
numero_revision SMALLINT NOT NULL
clave_idempotencia UUID NOT NULL
version_bloqueo_origen INTEGER NOT NULL
fotografia_revision_silabo JSONB NOT NULL
huella_sha256 CHAR(64) NOT NULL
enviado_por UUID (FK → usuarios.id) NOT NULL
enviado_en TIMESTAMPTZ NOT NULL
reapertura_id UUID (FK → reaperturas.id) NULL

UNIQUE (silabo_id, numero_revision)
UNIQUE (silabo_id, clave_idempotencia)
~~~

## observaciones_revision

**Contexto:** observaciones hechas sobre una revisión.

~~~text
id UUID (PK)
revision_silabo_id UUID (FK → revisiones_silabo.id) NOT NULL
clave_seccion VARCHAR NULL
clave_campo VARCHAR NULL
contenido_observacion_revision TEXT NOT NULL
estado_observacion_revision VARCHAR NOT NULL
creado_por UUID (FK → usuarios.id) NOT NULL
observado_en TIMESTAMPTZ NOT NULL
~~~

## solicitudes_correccion

**Contexto:** solicitud formal de corrección.

~~~text
id UUID (PK)
silabo_id UUID (FK → silabos.id) NOT NULL
revision_silabo_id UUID (FK → revisiones_silabo.id) NOT NULL UNIQUE
justificacion_solicitud_correccion TEXT NOT NULL
solicitado_por UUID (FK → usuarios.id) NOT NULL
solicitado_en TIMESTAMPTZ NOT NULL
~~~

## solicitud_correccion_observaciones

**Contexto:** puente entre solicitudes y observaciones.

~~~text
id UUID (PK)
solicitud_correccion_id UUID (FK → solicitudes_correccion.id) NOT NULL
observacion_revision_id UUID (FK → observaciones_revision.id) NOT NULL

UNIQUE (solicitud_correccion_id, observacion_revision_id)
~~~

## respuestas_observacion

**Contexto:** respuesta del docente a una observación.

~~~text
id UUID (PK)
silabo_id UUID (FK → silabos.id) NOT NULL
observacion_revision_id UUID (FK → observaciones_revision.id) NOT NULL UNIQUE
revision_respuesta_id UUID (FK → revisiones_silabo.id) NULL
contenido_respuesta_observacion TEXT NOT NULL
respondido_por UUID (FK → usuarios.id) NOT NULL
respondido_en TIMESTAMPTZ NOT NULL
~~~

## aprobaciones

**Contexto:** aprobación de una revisión.

~~~text
id UUID (PK)
silabo_id UUID (FK → silabos.id) NOT NULL
revision_silabo_id UUID (FK → revisiones_silabo.id) NOT NULL UNIQUE
clave_idempotencia UUID NOT NULL
huella_sha256 CHAR(64) NOT NULL
aprobado_por UUID (FK → usuarios.id) NOT NULL
aprobado_en TIMESTAMPTZ NOT NULL

UNIQUE (silabo_id, clave_idempotencia)
~~~

## reaperturas

**Contexto:** reapertura posterior a una aprobación.

~~~text
id UUID (PK)
silabo_id UUID (FK → silabos.id) NOT NULL
aprobacion_id UUID (FK → aprobaciones.id) NOT NULL UNIQUE
revision_aprobada_id UUID (FK → revisiones_silabo.id) NOT NULL
clave_idempotencia UUID NOT NULL
causa TEXT NOT NULL
reabierto_por UUID (FK → usuarios.id) NOT NULL
reabierto_en TIMESTAMPTZ NOT NULL

UNIQUE (silabo_id, clave_idempotencia)
~~~

## transiciones_silabo

**Contexto:** bitácora de cambios de estado.

~~~text
id UUID (PK)
silabo_id UUID (FK → silabos.id) NOT NULL
revision_silabo_id UUID (FK → revisiones_silabo.id) NULL
estado_origen VARCHAR NOT NULL
estado_destino VARCHAR NOT NULL
accion_transicion_silabo VARCHAR NOT NULL
actor_usuario_id UUID (FK → usuarios.id) NOT NULL
asignacion_rol_id UUID (FK → asignaciones_rol.id) NULL
metadatos_transicion_silabo JSONB NULL
ocurrido_en TIMESTAMPTZ NOT NULL
~~~

### Cardinalidades

~~~text
silabos 1:N revisiones_silabo
revisiones_silabo 0..1:N revisiones_silabo mediante revision_anterior_id
revisiones_silabo 1:N observaciones_revision
revisiones_silabo 1:0..1 solicitudes_correccion
solicitudes_correccion N:M observaciones_revision
  mediante solicitud_correccion_observaciones
observaciones_revision 1:0..1 respuestas_observacion
revisiones_silabo 1:0..1 aprobaciones
aprobaciones 1:0..1 reaperturas
silabos 1:N transiciones_silabo
~~~

---

# 7. Archivos, auditoría y operación

## objetos_almacenados

**Contexto:** metadatos de archivos privados; su contenido no está en la BD.

~~~text
id UUID (PK)
disco VARCHAR NOT NULL
ruta_interna VARCHAR NOT NULL
nombre_logico VARCHAR NOT NULL
mime VARCHAR NOT NULL
tamano_bytes BIGINT NOT NULL
huella_sha256 CHAR(64) NOT NULL
clasificacion VARCHAR NOT NULL
estado_objeto_almacenado VARCHAR NOT NULL
propietario_usuario_id UUID (FK → usuarios.id) NULL
carrera_id UUID (FK → carreras.id) NULL
almacenado_en TIMESTAMPTZ NOT NULL

UNIQUE (disco, ruta_interna)
~~~

## artefactos_exportacion

**Contexto:** exportaciones DOCX/PDF de revisiones de sílabo.

~~~text
id UUID (PK)
silabo_id UUID (FK → silabos.id) NOT NULL
revision_silabo_id UUID (FK → revisiones_silabo.id) NOT NULL
ejecucion_trabajo_id UUID (FK → ejecuciones_trabajo.id) NULL UNIQUE
objeto_docx_id UUID (FK → objetos_almacenados.id) NULL UNIQUE
objeto_pdf_id UUID (FK → objetos_almacenados.id) NULL UNIQUE
version_renderizador VARCHAR NOT NULL
idioma VARCHAR NOT NULL
clave_idempotencia UUID NOT NULL
estado_artefacto_exportacion VARCHAR NOT NULL
solicitado_por UUID (FK → usuarios.id) NOT NULL
asignacion_rol_id UUID (FK → asignaciones_rol.id) NULL
solicitado_en TIMESTAMPTZ NOT NULL
completado_en TIMESTAMPTZ NULL
plantilla_id UUID (FK → plantillas_silabo.id) NOT NULL

UNIQUE (revision_silabo_id, clave_idempotencia)
~~~

## notificaciones_internas

**Contexto:** notificaciones visibles dentro de la aplicación.

~~~text
id UUID (PK)
usuario_id UUID (FK → usuarios.id) NOT NULL
clave_deduplicacion VARCHAR NOT NULL
tipo_notificacion_interna VARCHAR NOT NULL
titulo_notificacion_interna VARCHAR NOT NULL
mensaje_notificacion_interna TEXT NOT NULL
tipo_recurso VARCHAR NULL
recurso_id UUID NULL
leido_en TIMESTAMPTZ NULL
notificado_en TIMESTAMPTZ NOT NULL

UNIQUE (usuario_id, clave_deduplicacion)
~~~

## eventos_auditoria

**Contexto:** trazabilidad de acciones relevantes.

~~~text
id UUID (PK)
actor_usuario_id UUID (FK → usuarios.id) NULL
asignacion_rol_id UUID (FK → asignaciones_rol.id) NULL
accion_evento_auditoria VARCHAR NOT NULL
tipo_recurso VARCHAR NOT NULL
recurso_id UUID NULL
resultado_evento_auditoria VARCHAR NOT NULL
metadatos_evento_auditoria JSONB NULL
correlacion_id UUID NULL
ocurrido_en TIMESTAMPTZ NOT NULL
~~~

## eventos_salientes

**Contexto:** outbox transaccional para publicar eventos de dominio.

~~~text
id UUID (PK)
tipo_agregado VARCHAR NOT NULL
agregado_id UUID NOT NULL
tipo_evento VARCHAR NOT NULL
clave_deduplicacion VARCHAR NOT NULL UNIQUE
contenido_evento_saliente JSONB NOT NULL
estado_evento_saliente VARCHAR NOT NULL
intentos SMALLINT NOT NULL
disponible_en TIMESTAMPTZ NOT NULL
procesado_en TIMESTAMPTZ NULL
codigo_error VARCHAR NULL
mensaje_error TEXT NULL
ocurrido_en TIMESTAMPTZ NOT NULL
~~~

## trabajos_fallidos

**Contexto:** trabajos fallidos de la cola Laravel.

~~~text
id BIGINT (PK)
uuid VARCHAR NOT NULL UNIQUE
connection VARCHAR NOT NULL
queue VARCHAR NOT NULL
payload TEXT NOT NULL
exception TEXT NOT NULL
failed_at TIMESTAMP NOT NULL
~~~

## migraciones

**Contexto:** historial de migraciones aplicadas.

~~~text
id INTEGER (PK)
migration VARCHAR NOT NULL
batch INTEGER NOT NULL
~~~

### Cardinalidades

~~~text
usuarios 1:N objetos_almacenados como propietario
carreras 1:N objetos_almacenados
silabos 1:N artefactos_exportacion
revisiones_silabo 1:N artefactos_exportacion
ejecuciones_trabajo 1:0..1 artefactos_exportacion
objetos_almacenados 1:0..1 artefactos_exportacion como DOCX
objetos_almacenados 1:0..1 artefactos_exportacion como PDF
usuarios 1:N notificaciones_internas
usuarios 1:N eventos_auditoria
~~~

---

# 8. Resumen de relaciones N:M

~~~text
usuarios N:M carreras por roles con alcance en asignaciones_rol
asignaciones_rol (docente) 1:N asignaciones_paralelo
paralelos 1:N asignaciones_paralelo
convocatorias_carreras N:M fuentes_academicas mediante fuentes_convocatoria
silabos N:M paralelos mediante alcances_silabo
silabos N:M usuarios colaboradores mediante colaboradores_silabo
silabos N:M definiciones_campo mediante valores_campo
solicitudes_correccion N:M observaciones_revision
  mediante solicitud_correccion_observaciones
recomendaciones_ia N:M evidencias_ia mediante recomendacion_evidencias_ia
~~~

# 9. Lo que aún no existe en producción

La configuración IA pendiente de despliegue todavía no tiene estas estructuras en
producción:

~~~text
definiciones_campo.ia_coordinacion_configurable
plantillas_silabo.revision_configuracion
preferencias_ia_carrera
~~~

Deben entrar por migraciones aditivas, no mediante cambios manuales en producción.
