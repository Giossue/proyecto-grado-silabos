# Base de datos actual de producción — Sílabos UEB
# 1. Identidad y acceso

## usuarios

**Contexto:** cuentas de administrador, coordinador y docente.

~~~text
id UUID (PK)
nombre VARCHAR NOT NULL
correo_electronico VARCHAR NOT NULL UNIQUE
correo_verificado_en TIMESTAMPTZ NULL
contrasena VARCHAR NOT NULL
activo BOOLEAN NOT NULL
codigo_recordarme VARCHAR NULL
secreto_dos_factores TEXT NULL
codigos_recuperacion_dos_factores TEXT NULL
dos_factores_confirmado_en TIMESTAMPTZ NULL
debe_cambiar_contrasena BOOLEAN NOT NULL
~~~

## roles

**Contexto:** catálogo de roles.

~~~text
id UUID (PK)
codigo VARCHAR NOT NULL UNIQUE
nombre VARCHAR NOT NULL
~~~

## asignaciones_rol

**Contexto:** rol otorgado a un usuario, global o por carrera.

~~~text
id UUID (PK)
usuario_id UUID (FK → usuarios.id) NOT NULL
rol_id UUID (FK → roles.id) NOT NULL
carrera_id UUID (FK → carreras.id) NULL
activo BOOLEAN NOT NULL
asignado_en TIMESTAMPTZ NULL

UNIQUE parcial: usuario_id, rol_id y carrera_id cuando activo
~~~

**Regla adicional:** un trigger de PostgreSQL permite una sola coordinación ejercible
por carrera: rol `coordinador` activo y cuenta activa.

## docentes_paralelo

**Contexto:** responsabilidad docente sobre un paralelo, respaldada por un rol docente
de la misma carrera.

~~~text
id UUID (PK)
asignacion_rol_id UUID (FK → asignaciones_rol.id) NOT NULL
paralelo_id UUID (FK → paralelos.id) NOT NULL
activo BOOLEAN NOT NULL
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
usuarios N:M roles mediante asignaciones_rol
usuarios N:M carreras por roles con alcance en asignaciones_rol
asignaciones_rol (docente) 1:N docentes_paralelo
paralelos 1:N docentes_paralelo
usuarios 1:N sesiones
~~~

---

# 2. Estructura académica

## facultades

**Contexto:** facultades institucionales.

~~~text
id UUID (PK)
codigo_institucional VARCHAR NULL UNIQUE
nombre VARCHAR NOT NULL
activo BOOLEAN NOT NULL
logo_ruta VARCHAR NULL
~~~

## campus

**Contexto:** sedes institucionales.

~~~text
id UUID (PK)
codigo_institucional VARCHAR NULL UNIQUE
nombre VARCHAR NOT NULL
activo BOOLEAN NOT NULL
~~~

## carreras

**Contexto:** carreras académicas.

~~~text
id UUID (PK)
facultad_id UUID (FK → facultades.id) NOT NULL
codigo_institucional VARCHAR NULL UNIQUE
nombre VARCHAR NOT NULL
activo BOOLEAN NOT NULL
campus_id UUID (FK → campus.id) NULL
modalidad VARCHAR NULL
~~~

## periodos_academicos

**Contexto:** períodos lectivos.

~~~text
id UUID (PK)
codigo VARCHAR NOT NULL UNIQUE
fecha_inicio DATE NOT NULL
fecha_fin DATE NOT NULL
semanas_lectivas SMALLINT NOT NULL
~~~

## mallas

**Contexto:** malla curricular de una carrera.

~~~text
id UUID (PK)
carrera_id UUID (FK → carreras.id) NOT NULL
codigo VARCHAR NOT NULL
estado VARCHAR NOT NULL
numero_ciclos SMALLINT NOT NULL

UNIQUE (carrera_id)
UNIQUE (carrera_id, codigo)
~~~

## asignaturas

**Contexto:** materias de una malla.

~~~text
id UUID (PK)
malla_id UUID (FK → mallas.id) NOT NULL
codigo_institucional VARCHAR NOT NULL
nombre VARCHAR NOT NULL
ciclo SMALLINT NULL
creditos NUMERIC NULL
horas_totales SMALLINT NULL
activo BOOLEAN NOT NULL
horas_proyecto NUMERIC NULL
horas_ap NUMERIC NULL
horas_ac NUMERIC NULL
horas_pae NUMERIC NULL
horas_aa NUMERIC NULL
horas_paec NUMERIC NULL
orden_en_ciclo SMALLINT NOT NULL
unidad_organizacion_curricular VARCHAR NULL
modalidad VARCHAR NULL

UNIQUE (malla_id, codigo_institucional)
~~~

## requisitos_asignatura

**Contexto:** relación de requisito entre dos asignaturas.

~~~text
id UUID (PK)
asignatura_id UUID (FK → asignaturas.id) NOT NULL
requisito_id UUID (FK → asignaturas.id) NOT NULL
tipo VARCHAR NOT NULL

UNIQUE (asignatura_id, requisito_id, tipo)
~~~

## programaciones_asignatura

**Contexto:** oferta de una asignatura en período y campus.

~~~text
id UUID (PK)
periodo_academico_id UUID (FK → periodos_academicos.id) NOT NULL
asignatura_id UUID (FK → asignaturas.id) NOT NULL
campus_id UUID (FK → campus.id) NOT NULL
activo BOOLEAN NOT NULL
modalidad VARCHAR NOT NULL

UNIQUE (periodo_academico_id, asignatura_id)
~~~

## paralelos

**Contexto:** paralelos de una programación.

~~~text
id UUID (PK)
programacion_asignatura_id UUID (FK → programaciones_asignatura.id) NOT NULL
codigo VARCHAR NOT NULL
activo BOOLEAN NOT NULL
jornada VARCHAR NULL

UNIQUE (programacion_asignatura_id, codigo)
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
nombre VARCHAR NOT NULL
descripcion TEXT NULL
activo BOOLEAN NOT NULL
mapeo_documento JSONB NULL

UNIQUE constante: existe solo una plantilla
~~~

## secciones_plantilla

**Contexto:** secciones principales de la plantilla.

~~~text
id UUID (PK)
clave VARCHAR NOT NULL
titulo VARCHAR NOT NULL
descripcion TEXT NULL
posicion SMALLINT NOT NULL
plantilla_id UUID (FK → plantillas_silabo.id) NOT NULL

UNIQUE (plantilla_id, clave)
UNIQUE (plantilla_id, posicion)
~~~

## bloques_plantilla

**Contexto:** agrupaciones de campos dentro de una sección.

~~~text
id UUID (PK)
seccion_plantilla_id UUID (FK → secciones_plantilla.id) NOT NULL
clave VARCHAR NOT NULL
tipo VARCHAR NOT NULL
titulo VARCHAR NOT NULL
configuracion JSONB NULL
posicion SMALLINT NOT NULL
plantilla_id UUID (FK → plantillas_silabo.id) NOT NULL

UNIQUE (plantilla_id, clave)
UNIQUE (seccion_plantilla_id, posicion)
~~~

## definiciones_campo

**Contexto:** definición de cada campo del sílabo, sus reglas y configuración IA.

~~~text
id UUID (PK)
bloque_plantilla_id UUID (FK → bloques_plantilla.id) NOT NULL
clave VARCHAR NOT NULL
etiqueta VARCHAR NOT NULL
ayuda TEXT NULL
tipo VARCHAR NOT NULL
obligatorio BOOLEAN NOT NULL
heredado BOOLEAN NOT NULL
origen_maestro VARCHAR NULL
editable_docente BOOLEAN NOT NULL
ia_habilitada BOOLEAN NOT NULL
reglas JSONB NULL
opciones JSONB NULL
marcador_documento VARCHAR NULL
posicion SMALLINT NOT NULL
plantilla_id UUID (FK → plantillas_silabo.id) NOT NULL

UNIQUE (plantilla_id, clave)
UNIQUE (bloque_plantilla_id, posicion)
~~~

## fuentes_academicas

**Contexto:** fuentes Markdown de una carrera, seleccionables para IA.

~~~text
id UUID (PK)
carrera_id UUID (FK → carreras.id) NOT NULL
nombre VARCHAR NOT NULL
descripcion TEXT NULL
activo BOOLEAN NOT NULL
contenido TEXT NULL

UNIQUE (carrera_id, nombre)
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
estado VARCHAR NOT NULL
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
estado VARCHAR NOT NULL
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
etapa VARCHAR NOT NULL
vence_en TIMESTAMPTZ NOT NULL

UNIQUE (convocatoria_id, etapa)
~~~

## silabos

**Contexto:** borrador vivo de un sílabo.

~~~text
id UUID (PK)
convocatoria_id UUID (FK → convocatorias_carreras.id) NOT NULL
asignatura_id UUID (FK → asignaturas.id) NOT NULL
malla_id UUID (FK → mallas.id) NOT NULL
estado VARCHAR NOT NULL
version_bloqueo INTEGER NOT NULL
porcentaje_completitud NUMERIC NOT NULL
iniciado_en TIMESTAMPTZ NULL
guardado_en TIMESTAMPTZ NULL
contexto_academico JSONB NOT NULL
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
docente_paralelo_id UUID (FK → docentes_paralelo.id) NOT NULL

UNIQUE (silabo_id, docente_paralelo_id)
~~~

## valores_campo

**Contexto:** valor no repetible de un campo dentro de un sílabo.

~~~text
id UUID (PK)
silabo_id UUID (FK → silabos.id) NOT NULL
definicion_campo_id UUID (FK → definiciones_campo.id) NOT NULL
valor JSONB NULL
heredado BOOLEAN NOT NULL
origen VARCHAR NULL

UNIQUE (silabo_id, definicion_campo_id)
~~~

## filas_repetibles

**Contexto:** filas ordenadas de campos tipo tabla o repetibles.

~~~text
id UUID (PK)
silabo_id UUID (FK → silabos.id) NOT NULL
definicion_campo_id UUID (FK → definiciones_campo.id) NOT NULL
datos JSONB NOT NULL
posicion SMALLINT NOT NULL

UNIQUE (silabo_id, definicion_campo_id, posicion)
~~~

## ejecuciones_validacion

**Contexto:** validación determinística de un borrador.

~~~text
id UUID (PK)
silabo_id UUID (FK → silabos.id) NOT NULL
ejecutado_por UUID (FK → usuarios.id) NOT NULL
version_reglas VARCHAR NOT NULL
estado VARCHAR NOT NULL
version_bloqueo INTEGER NOT NULL
errores_bloqueantes SMALLINT NOT NULL
advertencias SMALLINT NOT NULL
porcentaje_completitud NUMERIC NOT NULL
completado_en TIMESTAMPTZ NOT NULL
~~~

## resultados_validacion

**Contexto:** detalle de un error o advertencia.

~~~text
id UUID (PK)
ejecucion_validacion_id UUID (FK → ejecuciones_validacion.id) NOT NULL
definicion_campo_id UUID (FK → definiciones_campo.id) NULL
codigo VARCHAR NOT NULL
severidad VARCHAR NOT NULL
mensaje VARCHAR NOT NULL
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
tipo VARCHAR NOT NULL
estado VARCHAR NOT NULL
clave_idempotencia VARCHAR NOT NULL UNIQUE
correlacion_id UUID NULL
intentos SMALLINT NOT NULL
progreso SMALLINT NOT NULL
resultado JSONB NULL
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
estado VARCHAR NOT NULL
version_contrato VARCHAR NOT NULL
version_instruccion VARCHAR NOT NULL
version_pasarela_solicitada VARCHAR NOT NULL
version_pasarela_ejecutada VARCHAR NULL
idioma VARCHAR NOT NULL
contenido_entrada TEXT NOT NULL
huella_contenido CHAR(64) NOT NULL
huella_conjunto_fuentes CHAR(64) NOT NULL
metadatos_entrada JSONB NOT NULL
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
extracto TEXT NOT NULL
huella_contenido CHAR(64) NOT NULL
~~~

## recomendaciones_ia

**Contexto:** recomendaciones generadas para un campo.

~~~text
id UUID (PK)
ejecucion_ia_id UUID (FK → ejecuciones_ia.id) NOT NULL
definicion_campo_id UUID (FK → definiciones_campo.id) NOT NULL
ordinal SMALLINT NOT NULL
tipo VARCHAR NOT NULL
titulo VARCHAR NOT NULL
explicacion TEXT NOT NULL
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
decision VARCHAR NOT NULL
contenido_antes TEXT NULL
contenido_despues TEXT NULL
version_bloqueo_origen INTEGER NULL
version_bloqueo_resultado INTEGER NULL
decidido_en TIMESTAMPTZ NOT NULL

UNIQUE (recomendacion_ia_id, usuario_id, decision)
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
fotografia JSONB NOT NULL
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
contenido TEXT NOT NULL
estado VARCHAR NOT NULL
creado_por UUID (FK → usuarios.id) NOT NULL
observado_en TIMESTAMPTZ NOT NULL
~~~

## solicitudes_correccion

**Contexto:** solicitud formal de corrección.

~~~text
id UUID (PK)
silabo_id UUID (FK → silabos.id) NOT NULL
revision_silabo_id UUID (FK → revisiones_silabo.id) NOT NULL UNIQUE
justificacion TEXT NOT NULL
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
contenido TEXT NOT NULL
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
accion VARCHAR NOT NULL
actor_usuario_id UUID (FK → usuarios.id) NOT NULL
asignacion_rol_id UUID (FK → asignaciones_rol.id) NULL
metadatos JSONB NULL
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
estado VARCHAR NOT NULL
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
estado VARCHAR NOT NULL
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
tipo VARCHAR NOT NULL
titulo VARCHAR NOT NULL
mensaje TEXT NOT NULL
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
accion VARCHAR NOT NULL
tipo_recurso VARCHAR NOT NULL
recurso_id UUID NULL
resultado VARCHAR NOT NULL
metadatos JSONB NULL
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
contenido JSONB NOT NULL
estado VARCHAR NOT NULL
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
usuarios N:M roles mediante asignaciones_rol
usuarios N:M carreras por roles con alcance en asignaciones_rol
asignaciones_rol (docente) 1:N docentes_paralelo
paralelos 1:N docentes_paralelo
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
