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

| Módulo | Familias genéricas que se vuelven explícitas |
| --- | --- |
| Identidad | `nombre_usuario`, `usuario_activo`, `codigo_rol`, `nombre_rol`, `asignacion_rol_activa`, `docente_paralelo_activo` |
| Académico | códigos, nombres, estados, modalidades y activos de facultad, campus, carrera, malla, asignatura, programación y paralelo |
| Plantilla | claves, títulos, descripciones, tipos y posiciones de secciones, bloques y campos; nombre, descripción y estado de plantilla/fuente |
| Convocatorias y sílabos | estados de proceso, convocatoria y sílabo; posiciones/datos de filas y valores de campo |
| IA y validación | tipos, estados, resultados, contenidos, mensajes y metadatos de ejecuciones, recomendaciones, evidencias y validaciones |
| Revisión y operación | estados, contenidos, acciones, resultados, mensajes y metadatos de revisión, auditoría, outbox, notificación, objeto y exportación |

## Ejecución

1. Crear migraciones nuevas por módulo; cada una renombra columnas e índices sin
   alterar valores ni historial.
2. Adaptar en el mismo incremento modelos, consultas, validaciones, serializadores,
   interfaz, seeders y pruebas.
3. Mantener los contratos de presentación reutilizables (`code`, `name`, `active`)
   únicamente como proyecciones; nunca como nombre físico de columna.
4. Verificar migración, restricciones e índices en PostgreSQL, luego actualizar la
   fotografía del esquema de producción una vez que la migración remota esté aplicada.
