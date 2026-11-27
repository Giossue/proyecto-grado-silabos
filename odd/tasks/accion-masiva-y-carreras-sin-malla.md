# Llenar un campo en varias materias y carreras sin malla

Reemplaza la importación Excel del proyecto de carrera por una acción sobre varias materias, y las carreras nuevas nacen sin malla.
Rama: `main`, commits locales sin push. Pruebas: vitest en `apps/api`, `apps/web` y `packages/shared`.

## Specs

- S1 — Llenar un campo en varias materias. Pedido: «toca hacer algo más avisapado, como un tipo de bulk action». Aprobado con «Sí, pero intuitivo y limpio, super fácil».
  - S1.1 En «Proyecto de carrera», pestaña de materias, se marcan materias o un ciclo entero. Hay una casilla en cada materia, una en cada ciclo (sirve sin abrirlo) y una para todas las que se ven con el filtro.
  - S1.2 Al marcar aparece una barra con «Llenar un campo», parecida a la de «Materias y asignaciones», y «Quitar selección».
  - S1.3 Se elige el campo y se llena **una sola vez** con el mismo editor de la materia: texto, «Texto libre» o «Elegir varias».
  - S1.4 «Solo completa las materias sin definir. Si otras ya tienen algo, le avisa y las cambia solo si usted lo marca». Supuesto: «sin definir» es un campo pendiente según las reglas actuales (también «Faltan opciones») en el que la materia no tiene texto propio escrito; lo demás cuenta como «ya tiene algo». El servidor aplica la regla: solo reemplaza las materias que reciba en la lista de reemplazo, aunque hayan cambiado después de abrir la ventana.
  - S1.5 Supuesto: no se aplica un campo sin decidir (igual a la plantilla, o una elección sin opciones); se explica con un mensaje al pulsar el botón, que no se desactiva para validar.
  - S1.6 Mismas reglas que guardar una materia: validaciones, permisos por carrera, solo lectura según la regla vigente del proyecto de carrera (la reutiliza `careerProfileLockReason`; la define `odd/tasks/proyecto-carrera-solo-abierto.md`) y confirmación si un periodo finalizado se ve afectado. En solo lectura no hay casillas.
  - S1.7 La pantalla de Administración de una carrera funciona igual.
  - S1.8 Guía de la pantalla, ayuda, esqueletos de carga y `docs/sistema.md` al día.
- S2 — «toca quitar lo de importar lo de proyecto de carrera nomás»: se quita solo la importación Excel del proyecto de carrera (pantalla, rutas, código, pruebas, guía, ayuda y docs). Los demás Excel (carreras, usuarios, docentes y malla) quedan igual. Los datos guardados no se tocan.
- S3 — Carreras sin malla: «Claro, sin malla». Al crear una carrera, en pantalla o por Excel, no se crea ninguna malla. Se quita «Cantidad de ciclos» del formulario y «Número de ciclos» del Excel de carreras. Las carreras existentes conservan sus mallas. La primera se crea con «Nueva malla».
- S4 — Borrar de Engram el segundo mensaje con claves de producción: «Ok».

## Tasks

- [x] T1 (S4) — en línea. Borrado verificado; sin commit (está fuera del repositorio).
- [x] T2 (S1) — en línea. Servidor, ventana, casillas, barra, guía, ayuda, esqueleto y docs en `2bd8e51`. Arreglos de pantalla posteriores sin commit.
- [x] T3 (S2) — en línea, en `2bd8e51`.
- [x] T4 (S3) — en línea, en `2bd8e51`.
- [ ] T5 — revisión independiente antes de subir (escribe datos guardados en grupo).

## Log

- L1 (2026-11-27) — Pedido, textual: «sabes que creo, toca quitar lo de importar lo de proyecto de carrera nomás, toca hacer algo más avisapado, como un tipo de bulk action». Antes había preguntado: «una duda, cuando crea una carrrera, la malla el codigo la crea a partir de la carrera? diría que no, o sea que salga como vacío y que el coordinador ahi cree su malla como tal recién».
- L2 (2026-11-27) — Respuestas, textuales: «1. Sí, pero intuitivo y limpio, super fácil / 2. Claro, sin malla / 3. Ok», a: (1) hacer la acción para varias materias con los cuatro pasos propuestos y quitar el Excel del proyecto de carrera, (2) que las carreras nuevas nazcan sin malla y (3) borrar de Engram el otro mensaje.
- L3 (2026-11-27) — Se le avisó antes de aprobar: el Excel era la forma de cargar de una vez textos distintos por materia; la acción masiva pone lo mismo en varias. Sustituye en `docs/sistema.md` la importación del Excel del proyecto de carrera y «Al crear una carrera, su primera malla toma el código de la carrera».
- L4 (2026-11-27) — T1: borrada la fila del mensaje del 26-11; integridad de la base correcta.
- L5 (2026-11-27) — Otra sesión (proyecto-grado-silabos-nextjs-de) avisó que trabaja en el mismo árbol con cambios sin commit: cambia la regla de edición del proyecto de carrera (según relata, su usuario decidió allí que Coordinación edite antes de abrir y en pausa, no con el periodo abierto) y renombra `careerEditable` a `careerBlock`. Se le pidió hacer commit primero. Hasta entonces no se editan sus archivos ni se hace commit, porque el código nuevo depende de su cambio.
- L6 (2026-11-27) — Evidencia: API 2808/2810 en la corrida completa (los 2 fallos, en `fichaImports.test.ts`, pasan solos 22/22: tiempo agotado por carga); `src/components/domain/academic` 225/225; shared 167/167; `BulkFieldDialog` 9/9; `subjectProfileBulk` 13/13; tsc sin errores. Siguiente: tras su commit, conectar la ventana a la lista, T3, docs y guías, prueba en pantalla, imagen web, commits y revisión independiente.
- L7 (2026-11-27) — El commit `2bd8e51` (14:04) y su push (14:08) los hizo el usuario: «sisi fui yo, calma».
- L8 (2026-11-27) — Evidencia en copias de la base local (borradas): 8 materias llenadas a la vez sin tocar otros campos; reemplaza solo la marcada; pide confirmar antes de devolver a borrador un sílabo aprobado y no escribe nada hasta entonces; un fallo a mitad no deja nada guardado.
- L9 (2026-11-27) — En pantalla se corrigieron el pie que sobresalía, la lista de campos más ancha que la ventana, nombres de sección repetidos y el código separado del nombre.
- L10 (2026-11-27) — El usuario, textual: «te detengo, porque me dijeron que está medio complejo esto». Se le propusieron «Copiar de una materia» o una ventana corta. Respondió, textual: «si pones mejor esto en orden estaría bien … o sea de arriba para abajo, en llista, veamos como queda». La lista de materias por reemplazar pasa a una sola columna sin barra propia. Pendiente: su visto bueno, imagen web y revisión independiente (T5).
- L11 (2026-11-27) — El usuario, textual: «Borra eso que dice "7 ya tienen contenido y no cambian, salvo las que marque"». Se quita el encabezado de la lista; con una sola materia su casilla dice «Reemplazar en <materia>».
- L12 (2026-11-27) — Aclarado que la ventana solo toma materias de la malla elegida, se propuso mostrar la malla y separar por ciclo. El usuario, textual: «ahhh, entendido, entonces así está bien». Queda sin ese cambio. Evidencia: web 1389/1389, tsc sin errores e imagen web construida con podman.
