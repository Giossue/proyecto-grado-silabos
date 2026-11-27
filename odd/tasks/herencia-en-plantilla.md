# Datos heredados configurados desde la plantilla

Administración configura en la plantilla qué lista y qué tabla toman sus datos de otra tabla. Rama: main, sin commit hasta que el usuario lo pida. Pruebas: vitest. Sin producción. Entrega: por partes, en el orden de las tareas.

## Specs

- S1 — Todo depende de la plantilla: «recuerda que esto debe ser escalable y debe depender de una cosa, DE LA PLANTILLA QUE EDITA ADMIN». Nada se fija por número ni nombre de sección.
- S2 — Origen: una columna de una lista de una tabla de la plantilla (caso real: `unidades.unidades`, columna `resultado`). Cada fila del origen tiene un identificador interno estable: reordenar, corregir o borrar una fila no mueve lo escrito a otra.
- S3 — Una tabla puede declarar sus filas heredadas (`filas_desde`) y columnas heredadas (`desde`), que no se editan en el destino y se actualizan cuando cambia el origen. Nadie agrega ni quita esas filas.
- S4 — Nivel de contribución: una sola opción por fila entre las que defina la tabla; el documento pone la X. Falta elegir: se señala el resultado pendiente.
- S5 — Una lista (caso real: punto 4) puede tomar su contenido de la misma referencia.
- S6 — Texto que no va fila por fila (última columna del ejemplo): la plantilla permite uno por fila o uno común para toda la columna.
- S7 — Quién llena respeta la configuración actual de la plantilla y del proyecto de carrera. Si Coordinación no tiene todavía los resultados, las filas aparecen cuando el docente los escribe.
- S8 — Administración lo configura desde el editor, sin escribir JSON. Importar y exportar el JSON (forma corta en español), vista previa, PDF, Word y asistente de la plantilla entienden la relación.
- S9 — Las plantillas y tablas sin estas opciones no cambian. No se borra lo escrito al convertir una tabla y las revisiones enviadas o aprobadas conservan su definición. Las reglas actuales de unidades siguen funcionando.

Supuesto: la referencia de `## Log` L2 muestra nombres de claves propuestos; pueden ajustarse al formato existente.

## Tasks

- [x] T1 (S2, S3, S9) — Definición y JSON: referencia, validación e identificadores de fila. Delegada (conversación muy larga); RED y GREEN. Sin commit.
- [ ] T2 (S3, S5, S7, S9) — Resolver lo heredado en el sílabo, el proyecto de carrera y las revisiones.
- [ ] T3 (S4, S6, S7) — Pantallas de llenado.
- [ ] T4 (S8) — Editor de la plantilla y asistente.
- [ ] T5 (S4–S6, S8, S9) — Vista previa, PDF, Word, prueba en navegador y revisión independiente.

## Log

- L1 (2026-11-26) — «ok, ahí hay una regla, según nos indicaron, ese campo sería lo de resultados propiamente del punto 6 e igual manera el otro de resultado, o sea lo heredan, revisa el silabo de ejemplo». Sílabo de ejemplo (`temp/referencias/silabo-ejemplo/`): los 4 resultados de las unidades son los mismos del punto 4 y de la primera columna del punto 9; una X por resultado; la última columna es otro texto, no alineado fila por fila.
- L2 — Enfoque propuesto: ampliar las tablas actuales (`campos` + `diseño`) con `filas_desde` y `desde`, y añadir identificador estable por fila. Aprobado: «ok hagamos eso entonces».
- L3 — Estado previo: en el árbol hay cambios sin commit de `odd/tasks/texto-editable-por-docente.md` y de otra sesión (Malla, Biblioteca, lista de puesta en marcha, guías). No tocar los ajenos.
- L4 — Siguiente: mapa del motor de tablas y T1.
- L5 — T1 hecha: `filas_desde` (interno `rows_from`) en la lista y `desde` (`copy_of`) en la columna; identificador `_id` solo en listas usadas como origen (`row_ids`, calculado). Una lista heredada no pide filas propias. La suite del agente: API 2547, web 1194, shared 167. Riesgo: ítems 1 y 3; falta la revisión independiente al cerrar la función.
- L6 — Pendiente para T2: guardar el vínculo de cada fila heredada con su origen y conservarlo al normalizar; comprobar compatibilidad de tipos, largos y máximos; decidir el origen si la tabla está puesta más de una vez. Para T3: la lista heredada todavía muestra agregar/quitar y deja editar lo copiado. Para T4: `assistantDraft` no atrapa el error si el asistente rompe una referencia (leído en código). Las filas que llegan sin `_id` se numeran por posición.
