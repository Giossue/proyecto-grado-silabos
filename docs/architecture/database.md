# PostgreSQL y persistencia

## Convenciones

- **idioma (I-28)**: todos los identificadores del esquema (tablas, columnas, funciones,
  triggers) y los valores de estado almacenados van **en español**, con grafía sin tilde
  (`silabos`, `numero_revision`, `decision`). Las siglas técnicas se conservan (`id`,
  `uuid`, `mime`, `url`, `ip`, `sha256`, `docx`, `pdf`) igual que los nombres propios de
  formato (`markdown`, `es-EC`). Única excepción: las columnas internas de las tablas
  que los drivers de Laravel escriben con nombres fijos (`sesiones`,
  `trabajos_fallidos`, `restablecimientos_contrasena`, `migraciones`) — registrada como
  deuda técnica. Las clases y rutas de código siguen en inglés (precedente I-14).
  `SpanishSchemaTest` y `SpanishModelColumnsTest` hacen cumplir la regla.
- timestamps de Eloquent: `creado_en`/`actualizado_en`; donde `creado_en` ya es una
  marca de dominio (`notificaciones_internas`, `objetos_almacenados`,
  `observaciones_revision`), la marca de inserción de Eloquent se llama `registrado_en`.
- tablas/columnas: plural y `snake_case`;
- claves primarias internas: UUID generados por aplicación;
- claves foráneas e índices explícitos;
- tiempo: `timestamptz` en UTC; la conexión fija `DB_TIMEZONE=UTC` y la conversión a
  `America/Guayaquil` ocurre solo al presentar;
- estados de cardinalidad baja: texto legible + `CHECK` o enum PHP coherente;
- integridad: huellas SHA-256 como `char(64)` cuando aplique;
- JSON solo para datos variables que no requieren relaciones/consultas invariantes;
- campos de plantilla no cambian el esquema físico.

## Catálogo por módulo

### Identidad

`usuarios`, `roles`, `asignaciones_rol`. Las columnas de `usuarios` heredadas del
starter quedaron en español en I-28 (`nombre`, `correo_electronico`, `contrasena`,
`activo`, `codigo_recordarme`, `secreto_dos_factores`…); el modelo `User` declara los
puentes que Fortify y el guard exigen. I-29 hace las asignaciones de rol manuales:
`asignaciones_rol.activo` determina su efectividad y no guarda fechas de inicio o fin.

### Académico

`facultades`, `carreras`, `campus`, `modalidades`, `asignaciones_coordinador`,
`periodos_academicos`, `versiones_malla`, `asignaturas`, `requisitos_asignatura`,
`definiciones_campo_malla`, `valores_campo_asignatura`, `ofertas_academicas`,
`paralelos`, `asignaciones_docente`.

Estos catálogos no comparten una tabla polimórfica. `carreras.facultad_id` implementa la
relación uno-a-muchos Facultad → Carreras con clave foránea y borrado restringido.
`campus`, `modalidades` y `periodos_academicos` conservan identidad propia;
`ofertas_academicas` los relaciona con una asignatura mediante claves foráneas. La
modalidad además cuelga de la carrera (`carreras.modalidad_id`) y, si
`modalidades.combina_por_asignatura`, de cada materia (`asignaturas.modalidad_id`); la
oferta guarda la heredada (migración `000032`, I-35). La
jerarquía que presenta ADM-04 es una proyección de lectura y no una desnormalización de
la persistencia.

`versiones_malla` es el nombre físico histórico del agregado **Malla**. `es_actual`
identifica como máximo una fila actual por carrera mediante un índice parcial único; las
filas anteriores quedan como historia interna y no se exponen como versiones. La malla
actual puede estar `active` o `inactive` y define su cantidad de ciclos y sus campos de
tarjeta. Una definición puede enlazarse con una columna académica estructurada o almacenar
un valor tipado por asignatura en `valores_campo_asignatura`; nunca altera el DDL por
carrera. `asignaturas.ciclo` y `orden_en_ciclo` determinan la posición reproducible del
lienzo. Las coordenadas de pantalla no se persisten. `requisitos_asignatura.tipo`
conserva la semántica explícita de cada flecha.

`silabos.contexto_academico` conserva una fotografía JSON de la malla, la asignatura y la
oferta al crear el expediente. Es evidencia histórica de lectura y exportación; no
sustituye las relaciones transaccionales ni permite reconstruir autorizaciones.

### Plantillas y fuentes

`plantillas_silabo`, `versiones_plantilla`, `secciones_plantilla`, `bloques_plantilla`,
`definiciones_campo`, `fuentes_academicas`.

`plantillas_silabo` no referencia una carrera. Un índice parcial sobre
`es_institucional` permite como máximo una plantilla institucional; sus versiones
publicadas se fijan desde convocatorias de cualquier carrera. Los registros previos sin
esa marca se conservan solo como historia y no se habilitan para nuevas operaciones.

`fuentes_academicas` es un documento por fila (I-26): nombre único por carrera,
descripción, notas internas y `contenido` Markdown editable. Las tablas
`versiones_fuente`, `fragmentos_fuente` y `conflictos_fuente` se retiraron en la
migración `000020`; la evidencia de IA conserva su propia copia del contenido citado.

### Convocatorias y sílabos

`procesos_silabos`, `convocatorias`, `fuentes_convocatoria`,
`fechas_limite_convocatoria`, `silabos`, `alcances_silabo`, `colaboradores_silabo`,
`revisiones_silabo`, `filas_repetibles`, `valores_campo`, `transiciones_estado`.

`procesos_silabos` (I-31) es el calendario institucional: plantilla publicada, inicio,
entrega y estado. Un índice parcial único sobre `estado IN ('abierto', 'pausado')`
garantiza un solo proceso en curso. `convocatorias.proceso_id` es obligatorio; la
migración `000027` creó un proceso por cada convocatoria existente con su propia
plantilla y fechas. El estado `pausada` de la convocatoria y `pausado` del proceso
detienen el trabajo docente sin borrar nada.

### Revisión, validación e IA

`revisiones_silabo`, `observaciones_revision`, `solicitudes_correccion`,
`solicitud_correccion_observaciones`, `respuestas_observacion`, `aprobaciones`,
`reaperturas`, `transiciones_silabo`, `ejecuciones_validacion`,
`resultados_validacion`, `ejecuciones_ia`, `evidencias_ia`, `recomendaciones_ia`,
`recomendacion_evidencias_ia`, `retroalimentacion_ia`.

### Operación e integración

`objetos_almacenados`, `artefactos_exportacion`, `notificaciones_internas`,
`eventos_auditoria`, `eventos_salientes` (outbox transaccional), `ejecuciones_trabajo`.
Las tablas de importación institucional (`ejecuciones_importacion`, `items_importacion`,
`conflictos_importacion`, `alias_institucionales`) se retiraron el 2026-08-27 junto con
el módulo que las usaba.

### Framework

Colas y caché operan sobre Redis, así que `jobs`, `job_batches`, `cache` y
`cache_locks` se eliminaron en I-28. Sobreviven, renombradas por configuración
soportada: `sesiones` (driver de sesión `database`), `trabajos_fallidos` (registro
forense de trabajos agotados), `restablecimientos_contrasena` (broker de recuperación)
y `migraciones` (control del migrador; su renombrado se hace con
`php artisan db:rename-migrations-table` antes de `migrate`, nunca dentro de una
migración). Sus columnas internas conservan los nombres que los drivers exigen.

Los nombres definitivos se implementan desde el modelo físico v0.1 y se modifican solo
mediante migración/ADR.

## Inmutabilidad

Las tablas de revisión, aprobación, versión publicada, evidencia y auditoría no admiten
edición funcional. Las correcciones agregan filas. Si es necesario corregir metadatos
administrativos, se registra el cambio y se preserva el valor anterior. ADM-04 implementa
esta corrección mediante actualización transaccional del catálogo y un evento append-only
con campos modificados y valores anterior/nuevo; no requiere desnormalizar ni duplicar la
entidad. La malla actual no es una versión publicada: permanece editable y su historia se
protege mediante el contexto académico fijado en cada sílabo.

## Borrado

- `RESTRICT` para referencias históricas.
- `CASCADE` únicamente entre padre e hijos que no tienen sentido independiente y aún no
  constituyen evidencia publicada.
- la malla actual solo se elimina cuando no tiene ofertas ni sílabos; con dependencias se
  deshabilita.
- catálogos y usuarios con historia se desactivan/archivan.
- migraciones destructivas requieren copia, verificación, rollback ensayado y aprobación.

## Índices y restricciones

Como mínimo, prueba/define:

- unicidad de identificadores institucionales no nulos;
- no solapamiento de coordinador activo por carrera;
- identidad del sílabo canónico;
- número de revisión único por sílabo;
- versión única por plantilla y nombre de fuente único por carrera;
- claves de idempotencia únicas por operación;
- filtros frecuentes por convocatoria, estado, asignación, plazo y fecha;
- búsquedas de auditoría por recurso/actor/tiempo;
- una sola malla actual por carrera mediante índice parcial único;
- clave y dato estructurado únicos por malla, y un valor por
  asignatura/definición;
- colas/outbox por estado y próximo intento.

Usa índices parciales o constraints de exclusión PostgreSQL cuando expresen mejor la
regla. Acompáñalos con pruebas en PostgreSQL real.

`DatabaseBootstrapTest` comprueba la zona efectiva de la sesión PostgreSQL y ejecuta el
seeder dos veces. Las asignaciones abiertas se reutilizan sin cambiar su fecha histórica;
esto evita que una diferencia de representación temporal intente crear rangos solapados.

### Invariantes de IA implementados

- la ejecución, el campo y la versión de plantilla pertenecen al mismo sílabo;
- una clave funcional activa es única por sílabo/campo, y una ejecución fallida permite
  una solicitud nueva sin reescribir historia;
- evidencia solo se fija mientras la ejecución está pendiente y debe provenir de una
  fuente activa, de igual carrera y fijada por la convocatoria;
- recomendaciones y sus citas solo se insertan mientras la ejecución está corriendo y
  deben pertenecer al mismo análisis/campo;
- una ejecución terminal y todos sus hijos son append-only; no admite evidencia o salida
  tardía;
- feedback solo referencia una ejecución completada; una aplicación por recomendación es
  única y exige `version_bloqueo_resultado = version_bloqueo_origen + 1`.

Las invariantes del módulo de importación institucional se retiraron con sus tablas el
2026-08-27.

## Migraciones

- Una migración hace una transformación coherente y revisable.
- No edites una migración aplicada en entornos compartidos.
- Separa backfill costoso del cambio de constraint cuando reduzca riesgo.
- Datos de catálogo controlados usan seeders idempotentes; no ocultes datos académicos
  productivos dentro de migraciones.
- Documenta forward, verificación y recuperación antes de ejecutar en producción.

## Rendimiento

- Pagina en servidor.
- Evita N+1 con cargas explícitas.
- No carga el JSON completo de un sílabo para cada fila de una cola.
- Mide con `EXPLAIN (ANALYZE, BUFFERS)` en datos representativos antes de agregar índices.
- No uses Redis para compensar una consulta incorrecta sin baseline.
