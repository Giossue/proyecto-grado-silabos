# Texto del proyecto de carrera editable por el docente

Coordinación puede dejar que el docente cambie el texto de un campo del proyecto de carrera. Rama: main, sin commit hasta que el usuario lo pida. Pruebas: vitest. Sin migración y sin producción.

## Specs

- S1 — Cada campo del proyecto de carrera tiene la casilla «El docente puede editar este texto», desmarcada por defecto. Marcada, el campo cuenta como definido.
- S2 — La casilla está disponible solo en campos sin espacios de respuesta (propuesto al implementar; el servidor rechaza la combinación).
- S3 — Retirado: el proyecto de carrera no tiene acciones masivas (L10).
- S4 — Con la casilla, el docente recibe el texto escrito y puede cambiarlo solo en su sílabo. Se mantienen tablas, bloques y datos del sistema. No aplica el límite de caracteres del campo (supuesto).
- S5 — Retirado: el docente no tiene botón para restaurar (L10).
- S6 — Si el docente ya cambió el texto y Coordinación cambia el original, se conserva lo del docente sin aviso («no esto no, que tontería la verdad, directo sin esta cosa de abajo», 2026-11-26). Si no lo tocó, recibe el texto nuevo.
- S8 — «y debería salir lo de tiptap si es que el docente puede editar, siempre» (2026-11-26): un campo que es entero del docente usa el editor con formato. Supuesto: los espacios dentro de una frase o celda siguen simples.
- S7 — La importación de Excel no quita la marca. Los campos sin la casilla funcionan como antes.

## Tasks

- [x] T1 (S1–S4, S6, S7) — API, en línea; RED y GREEN. Sin commit.
- [x] T2 (S1–S3, S4–S6) — Web, en línea; RED y GREEN. Sin commit.
- [ ] T3 (S1–S7) — Prueba en el navegador y revisión independiente (cambia qué puede editar el docente).

## Log

- L1 (2026-11-26) — «recuerdo en una reunión con la coordinadora que podemos dejar por ejemplo el punto 10 editable pero también para los docentes, pero en las opciones del coordinador hay actualmente libre, opcion y multiopcion, y claro, si no es ninguna es el coordinador que escribe creo que así es y que eso no le deja editar al docente, qué hacemos ahí?»
- L2 — «1 entonces».
- L3 — «ok hazlo y probemos».
- L4 — Diseño: la marca va en `attrs.teacherEdits` del valor de la materia; el texto propio del docente lleva `attrs.baseText` (huella del texto de Coordinación en que se basó), que pone solo el servidor. Un valor sin `baseText` sigue el texto de Coordinación.
- L5 — El punto 10 es «No editable» en la plantilla; Administración debe ponerlo «Editable».
- L6 — Prueba en el navegador (local): se creó el periodo NOVIEMBRE-ABRIL 2026-2027; casilla activada en el punto 10 de Cálculo I. Fallo encontrado: al guardar Coordinación se reemplazaba el texto del docente (`InProgressWork.sync` no reconocía la marca). Prueba que lo reproduce y corrección en `inProgressWork.ts`. Después: se conserva el texto, aparece el aviso y funcionan «Ver texto nuevo», «Conservar el mío» y «Restaurar texto original», sin errores de consola. No probado en navegador: «Usar texto nuevo», acción masiva, envío, PDF e importación de Excel. Respaldo previo: `/tmp/silabos-e2e-2fYQ/antes-texto-docente.dump`.
- L7 — Siguiente: revisión independiente.
- L8 — «no esto no, que tontería la verdad, directo sin esta cosa de abajo» (sobre el cuadro de aviso); propuesta 1 (conservar sin aviso, con el botón de restaurar) aceptada con «ok hazlo». Se quitan el aviso, `keep_own_text` y la huella; la marca pasa a `attrs.ownText`.
- L9 — «y debería salir lo de tiptap si es que el docente puede editar, siempre». Hecho con `openShape`/`writtenValue`; RED y GREEN. Navegador: los 5 campos de la sección 7 usan el editor y la lista se conserva al recargar; en el punto 10 el texto del docente se conserva sin aviso y «Restaurar texto original» trae la última versión; sin errores de consola. Pendiente: revisión independiente.
- L10 (2026-11-26) — «Quitemos nomas lo de acciones masivas … y quitame lo de restaurar texto original». Se quita toda la función de acciones masivas del proyecto de carrera (pantalla, API y rutas) y el botón de restaurar. Los valores con `attrs.accepted` ya guardados siguen contando como definidos. Reemplaza S3 y S5.
