# Cierre antes de subir

Arreglar lo que puede perder texto y lo visible que falta. Rama: main, sin commit hasta que el usuario lo pida. Pruebas: vitest. Sin producción.

## Specs

- S1 — Retirado (L6): ningún cambio de plantilla ni del proyecto de carrera se bloquea; el sílabo afectado se adapta y, si estaba enviado o aprobado, vuelve a borrador. Se conserva el texto que tenga dónde ir, incluidas las correcciones de encabezado.
- S2 — Cuando el servidor reconstruye valores de un borrador sin devolverlo a otro estado, una pestaña vieja no puede pisar lo reconstruido (conflicto de versión, como en los demás guardados).
- S3 — La adaptación elige de forma determinista el valor anterior de cada campo; si hay varios para la misma clave, gana el del campo vigente y con texto.
- S4 — Importar Excel no pierde las filas de una tabla de una sola columna.
- S5 — En el PDF, el cuadro «Elaborado por / Revisado y aprobado por» no se parte entre páginas.
- S6 — Los textos de ayuda y mensajes de error ya no hablan de «Editable / No editable», de las casillas quitadas, de acciones masivas ni de «Restaurar texto original»; describen «¿Quién lo llena?».
- S7 — Actualizar un documento de apoyo encola la vista nueva aunque falle el borrado del archivo anterior.

## Tasks

- [x] T1 (S1–S4) — Datos; delegada. S1–S4 hechas; el falso bloqueo raro al reabrir se acepta (L5). Sin commit.
- [x] T2 (S5–S7) — Documentos y textos; delegada en paralelo. Sin commit.
- [ ] T3 — Integración, pruebas completas, comprobación en navegador y revisión independiente de lo corregido.

## Log

- L1 (2026-11-27) — «ok, puedes arreglar lo que falta o no hace falta ya algo?». Alcance: bloqueo de columnas propuesto en el mensaje anterior y avisos abiertos de la revisión (ver `quien-lo-llena.md` L11–L12). Quedan fuera: que el asistente elija «Solo el docente», límite de filas en servidor y avisos de accesibilidad.
- L2 — API 2631, web 1212, shared 165 (reportado por el agente tras la corrección). Revisión independiente: S2–S7 pasan (S5 solo sobre el XML de Word; el render de muestra lo hizo el autor en Gotenberg). Bloqueo B1 de S1: al reabrir, texto de Coordinación cambiado con el periodo cerrado se toma como texto del docente.
- L3 — Una corrección: no existe regla automática segura porque los valores no guardan autor. Se mantiene el bloqueo y el mensaje de reapertura explica la salida (deshacer el cambio de plantilla o, si no se tocaron esos campos, volver a escribir en el proyecto de carrera el texto que tienen los sílabos). Necesita decisión del usuario: salida manual, autorización explícita de Administración aceptando pérdida, o registrar autoría con migración (no cubre filas existentes). No se probó que la salida manual sirva en todos los casos (paralelos con textos distintos, valores ya inconsistentes).
- L4 — Pendiente: prueba en navegador del bloqueo (la sesión local de Administración caducó). Respaldo: `/tmp/silabos-e2e-2fYQ/antes-bloqueo.dump`.
- L5 (2026-11-27) — El usuario preguntó «para qué quiero saber quien escribio que» y dijo «es que da igual eso la verdad»: no se registra autoría; se deja como está (opción 1): ante la duda se bloquea y el mensaje explica la salida manual.
- L6 (2026-11-27) — «pero qué sería de hacer? lo mismo que le pasaría a coordinador no? no ves que si yo edito algo la idea es que simplemente regrese a borrador ese silabo en concreto y ya», «tenemos que hacerlos iguales», y ante el ejemplo (A: se aplica y la frase se pierde; B: no deja hacer el cambio) respondió «A Siempre». Se quita el bloqueo. Reemplaza L3 y L5.
