# Tablas en el proyecto de carrera

Que las tablas de un campo Editable se puedan definir y llenar sin trabas. Rama: main, sin commit hasta que el usuario lo pida. Pruebas: vitest. Sin migración ni producción.

## Specs

Tabla que admite filas: solo filas de encabezado y, debajo, una única fila de celdas vacías sin combinar hacia abajo (regla existente `listTable`).

- S1 — Casilla «El docente llena esta tabla» en el proyecto de carrera, para campos con tabla en los que Coordinación no escribió nada y quedan celdas vacías. Marcada, el campo deja de estar «Sin definir» y el docente completa la tabla como hoy (en una tabla que admite filas, también agrega y quita filas). Sin marcar y vacía, sigue «Sin definir».
- S2 — En una tabla que admite filas, Coordinación puede agregar y quitar filas (nunca menos de una). Si escribe en la tabla, queda fija para el docente.
- S3 — Encabezados y columnas siguen protegidos. Las tablas de filas fijas no permiten agregar ni quitar filas.
- S4 — «Texto libre» (y las demás opciones del engranaje) en un campo con tabla no reemplaza la tabla: se coloca dentro de la celda vacía donde está el cursor. Si el cursor no está en una celda vacía, la pantalla lo explica; nunca falla en silencio.
- S5 — Con «El docente puede editar este texto», en una tabla que admite filas el docente cambia celdas y agrega o quita filas.
- S6 — Las dos casillas son excluyentes: al marcar una se desmarca la otra.
- S7 — La marca de S1 se conserva al leer, al importar Excel si no se escribe en la tabla y al reconstruir sílabos; no se pierde nada ya escrito por Coordinación o el docente. Los campos sin tabla funcionan como antes.

## Tasks

- [x] T1 (S1–S7) — API, compartido y web; delegada (conversación muy larga). Sin commit.
- [ ] T2 — Prueba en el navegador y revisión independiente.

## Log

- L1 (2026-11-26) — «acá está raro … se supone que las tablas están protegidas, pero veo que me dejan nomás borrar los encabezados … dice que me deja poner texto libre, pero no pasa nada … si no pongo eso sale sin definir, o sea, un rollo horrible con las tablas» y «veo que no me deja añadir o quitar finlas».
- L2 — Propuesta (casilla «El docente llena esta tabla», filas para Coordinación, estructura protegida, «Texto libre» solo en celda vacía, filas para el docente que puede editar), aceptada: «ok hazlo entonces». Los encabezados ya quedaron protegidos antes.
- L3 — La herencia entre tablas se descartó y se retiró; esa retirada sigue sin commit en el árbol y debe conservarse.
- L4 — T1 hecha (API 2546, web 1206, shared 165; repetidas 18 y 12 pruebas nuevas). Navegador local, sección 9 de Cálculo I: Coordinación agrega y quita filas sin bajar de una; «Texto libre» fuera de una celda vacía muestra el mensaje y no cambia la tabla; la casilla «El docente llena esta tabla» se guarda; el docente agrega una fila y se conserva al recargar. Consola: un aviso «Incorrect use of label for» en la vista del docente (etiqueta que apunta a un grupo de la tabla). No probado en navegador: casilla de editar con filas, importación de Excel, envío y PDF.
- L5 — Decisiones del agente por confirmar: al guardar, varias filas vacías se reducen a una; si Coordinación llena solo algunas celdas, no se agregan ni quitan filas pero el docente puede llenar el resto; en un campo con tabla ya no se ponen espacios nuevos fuera de la tabla. Defecto anterior sin corregir (leído en código): la importación de Excel pierde las filas de una tabla de una sola columna.
