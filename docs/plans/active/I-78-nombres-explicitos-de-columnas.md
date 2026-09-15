# I-78 — Nombres explícitos de columnas

## Decisión

Los atributos de dominio no usarán nombres genéricos cuando su significado dependa de
la tabla. Se nombrarán con el concepto que representan: por ejemplo,
`codigo_facultad`, `nombre_facultad`, `estado_silabo` y `tipo_recomendacion_ia`.

## Excepciones técnicas y semánticas

Se conservan porque ya son inequívocos o responden a un contrato externo:

- claves primarias `id`, foráneas `*_id`, hashes, UUIDs y claves de idempotencia;
- momentos que describen el hecho que registran (`asignado_en`, `enviado_en`,
  `almacenado_en`, `observado_en`…);
- columnas propias de los drivers de Laravel: `sesiones`,
  `restablecimientos_contrasena`, `trabajos_fallidos` y `migraciones`;
- valores técnicos como `codigo_error`, `mensaje_error`, `mime`, `payload`, `token`,
  `ip_address` y `user_agent`.

## Matriz de nombres a normalizar

La matriz se limita a atributos de negocio genéricos. No renombra las FK, los UUID,
las huellas, los tokens, las fechas que nombran un hecho ni los contratos internos de
Laravel. Las propiedades de presentación pueden continuar llamándose `name`, `code` o
`active`: son proyecciones, no nombres de columnas.

| Tabla | Columnas actuales → nombres físicos explícitos |
| --- | --- |
| `roles` | `codigo` → `codigo_rol`; `nombre` → `nombre_rol` |
| `asignaciones_rol` | `activo` → `asignacion_rol_activa` |
| `docentes_paralelo` | `activo` → `docente_paralelo_activo` |
| `facultades` | `nombre` → `nombre_facultad`; `activo` → `facultad_activa`; `logo_ruta` → `ruta_logo_facultad` |
| `campus` | `nombre` → `nombre_campus`; `activo` → `campus_activo` |
| `carreras` | `nombre` → `nombre_carrera`; `activo` → `carrera_activa`; `modalidad` → `modalidad_carrera` |
| `periodos_academicos` | `codigo` → `codigo_periodo_academico`; `fecha_inicio` → `fecha_inicio_periodo`; `fecha_fin` → `fecha_fin_periodo`; `semanas_lectivas` → `cantidad_semanas_lectivas` |
| `mallas` | `codigo` → `codigo_malla`; `estado` → `estado_malla`; `numero_ciclos` → `cantidad_ciclos_malla` |
| `asignaturas` | `nombre` → `nombre_asignatura`; `ciclo` → `ciclo_asignatura`; `creditos` → `creditos_asignatura`; `horas_totales` → `total_horas_asignatura`; `activo` → `asignatura_activa`; `orden_en_ciclo` → `orden_asignatura_en_ciclo`; `unidad_organizacion_curricular` → `unidad_organizativa_curricular_asignatura`; `modalidad` → `modalidad_asignatura` |
| `programaciones_asignatura` | `activo` → `programacion_asignatura_activa`; `modalidad` → `modalidad_programacion_asignatura` |
| `paralelos` | `codigo` → `codigo_paralelo`; `activo` → `paralelo_activo`; `jornada` → `jornada_paralelo` |
| `requisitos_asignatura` | `tipo` → `tipo_requisito_asignatura` |
| `plantillas_silabo` | `nombre` → `nombre_plantilla_silabo`; `descripcion` → `descripcion_plantilla_silabo`; `activo` → `plantilla_silabo_activa`; `mapeo_documento` → `mapeo_documento_plantilla` |
| `secciones_plantilla` | `clave` → `clave_seccion_plantilla`; `titulo` → `titulo_seccion_plantilla`; `descripcion` → `descripcion_seccion_plantilla`; `posicion` → `posicion_seccion_plantilla` |
| `bloques_plantilla` | `clave` → `clave_bloque_plantilla`; `tipo` → `tipo_bloque_plantilla`; `titulo` → `titulo_bloque_plantilla`; `configuracion` → `configuracion_bloque_plantilla`; `posicion` → `posicion_bloque_plantilla` |
| `definiciones_campo` | `clave` → `clave_definicion_campo`; `etiqueta` → `etiqueta_definicion_campo`; `ayuda` → `ayuda_definicion_campo`; `tipo` → `tipo_definicion_campo`; `reglas` → `reglas_definicion_campo`; `opciones` → `opciones_definicion_campo`; `posicion` → `posicion_definicion_campo` |
| `fuentes_academicas` | `nombre` → `nombre_fuente_academica`; `descripcion` → `descripcion_fuente_academica`; `activo` → `fuente_academica_activa`; `contenido` → `contenido_fuente_academica` |
| `convocatorias_universidad` | `estado` → `estado_convocatoria_universidad` |
| `convocatorias_carreras` | `estado` → `estado_convocatoria_carrera` |
| `fechas_limite_convocatoria` | `etapa` → `etapa_fecha_limite_convocatoria` |
| `silabos` | `estado` → `estado_silabo`; `contexto_academico` → `contexto_academico_silabo` |
| `valores_campo` | `valor` → `valor_campo`; `origen` → `origen_valor_campo` |
| `filas_repetibles` | `datos` → `datos_fila_repetible`; `posicion` → `posicion_fila_repetible` |
| `ejecuciones_validacion` | `estado` → `estado_ejecucion_validacion`; `advertencias` → `cantidad_advertencias_validacion` |
| `resultados_validacion` | `codigo` → `codigo_resultado_validacion`; `severidad` → `severidad_resultado_validacion`; `mensaje` → `mensaje_resultado_validacion` |
| `ejecuciones_ia` | `estado` → `estado_ejecucion_ia`; `contenido_entrada` → `contenido_entrada_ia`; `metadatos_entrada` → `metadatos_entrada_ia` |
| `evidencias_ia` | `extracto` → `extracto_evidencia_ia` |
| `recomendaciones_ia` | `tipo` → `tipo_recomendacion_ia`; `titulo` → `titulo_recomendacion_ia`; `explicacion` → `explicacion_recomendacion_ia` |
| `retroalimentacion_ia` | `decision` → `decision_retroalimentacion_ia`; `contenido_antes` → `contenido_anterior_retroalimentacion_ia`; `contenido_despues` → `contenido_posterior_retroalimentacion_ia` |
| `revisiones_silabo` | `fotografia` → `fotografia_revision_silabo` |
| `observaciones_revision` | `contenido` → `contenido_observacion_revision`; `estado` → `estado_observacion_revision` |
| `respuestas_observacion` | `contenido` → `contenido_respuesta_observacion` |
| `solicitudes_correccion` | `justificacion` → `justificacion_solicitud_correccion` |
| `transiciones_silabo` | `accion` → `accion_transicion_silabo`; `metadatos` → `metadatos_transicion_silabo` |
| `artefactos_exportacion` | `estado` → `estado_artefacto_exportacion` |
| `objetos_almacenados` | `estado` → `estado_objeto_almacenado` |
| `notificaciones_internas` | `tipo` → `tipo_notificacion_interna`; `titulo` → `titulo_notificacion_interna`; `mensaje` → `mensaje_notificacion_interna` |
| `eventos_auditoria` | `accion` → `accion_evento_auditoria`; `resultado` → `resultado_evento_auditoria`; `metadatos` → `metadatos_evento_auditoria` |
| `eventos_salientes` | `contenido` → `contenido_evento_saliente`; `estado` → `estado_evento_saliente` |
| `ejecuciones_trabajo` | `tipo` → `tipo_ejecucion_trabajo`; `estado` → `estado_ejecucion_trabajo`; `resultado` → `resultado_ejecucion_trabajo` |

## Ejecución

1. Crear migraciones nuevas por módulo; cada una renombra columnas e índices sin
   alterar valores ni historial.
2. Adaptar en el mismo incremento modelos, consultas, validaciones, serializadores,
   interfaz, seeders y pruebas.
3. Mantener los contratos de presentación reutilizables (`code`, `name`, `active`)
   únicamente como proyecciones; nunca como nombre físico de columna.
4. Verificar migración, restricciones e índices en PostgreSQL, luego actualizar la
   fotografía del esquema de producción una vez que la migración remota esté aplicada.
