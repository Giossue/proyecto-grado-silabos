# IA con dos tablas estándar

Objetivo: dejar toda la IA en dos tablas (sesiones y mensajes) y el permiso de lectura como columna del campo. Rama `main`, commits locales sin push, una migración nueva por entrega si conviene. Pruebas por paquete (`apps/api`, `apps/web`, `packages/shared`): `npx vitest run`, `npx tsc --noEmit -p .`, `npx eslint`.

## Specs

- S1 — Pedido (2026-11-27), textual: «UNA TABLA PARA UN CAMPO??? no entiendo la verdad, debería haber una tabla estándar para lo de la ia, por ejemplo para la ia en n8n saben crear 2 tablas una para mensajes y otra para relacionar las sesiones, nada más, además permisos lectura para un campo me parece una tontería, y lo de propuesta no es necesario porque como tal es solo texto que el agente da de cierta manera y ya».
- S2 — Toda la IA (docente y asistente de plantilla de Administración) usa `sesiones_ia` (quién conversa y sobre qué: un sílabo o la plantilla) y `mensajes_ia` (cada pregunta y respuesta). Las propuestas van dentro del contenido del mensaje. Cada mensaje conserva su estado y su error, porque la respuesta se prepara en segundo plano. Desaparecen `mensajes_ia_docente`, `propuestas_ia_docente`, `mensajes_ia_plantilla`, `propuestas_ia_plantilla` y `permisos_lectura_ia`. De 38 tablas del sistema quedan 35.
- S3 — El permiso «La IA puede leerlo» es una columna de la tabla de campos. Guardar o importar la plantilla conserva el valor por la clave del campo; un campo nuevo empieza apagado. Cambiarlo no mueve `plantilla_silabo.plantilla_modificada_en`, no toca sílabos ni avisa.
- S4 — No se editan migraciones aplicadas. La migración nueva primero traslada conversaciones, propuestas y permisos, y solo después borra las tablas viejas. Antes se saca una copia de seguridad de la base local y la migración se prueba sobre una copia.
- S5 — Las pantallas se ven y funcionan igual: el docente solo «Copiar»; en Administración aplicar y descartar siguen funcionando, con ese estado dentro del mensaje.
- S6 — Sin push.

Supuestos por comprobar: la columna va en `campos_plantilla`; los índices únicos de pedido abierto e idempotencia se mantienen en `mensajes_ia`; las huellas y la versión de borrador que usa Administración para aplicar van dentro del mensaje; el límite diario sigue en Redis.

Datos ya comprobados: `syncDocumentOn` (`apps/api/src/modules/template/template-structure.repository.ts`) actualiza `campos_plantilla` por identificador o crea la fila; `docs/sistema.md` dice que cada guardado de la plantilla crea identificadores nuevos (comprobar cuáles). Permisos: `apps/api/src/server/ai/readPermissionStore.ts`. Docente: `apps/api/src/server/ai/teacher*.ts`.

## Tasks

- [x] T1 (S3, S4) — permiso como columna del campo — en línea — RED 16 pruebas, GREEN; migración `20261127020000` probada en copia y aplicada en local; commit `0b892a9`.
- [x] T2 (S2, S4, S5) — IA del docente en las dos tablas, con las propuestas dentro del mensaje — en línea — RED y GREEN; migración `20261127030000` probada en copia; evidencia en L7.
- [ ] T3 (S2, S4, S5) — asistente de plantilla de Administración en las mismas dos tablas — en línea — pendiente.
- [ ] T4 (S2–S6) — documentación, verificación completa, migración probada sobre copia de la base local y reinicio de `silabos-worker` — en línea — pendiente.

Riesgo: item 1 (la migración traslada y borra datos guardados).

## Log

- L1 (2026-11-27) — Pedido original en S1. Se le propuso dejar 2 tablas para toda la IA (35 en total) o quitar solo las dos señaladas (36); se recomendó la primera, avisando que cambia también el asistente de Administración y que requiere una migración nueva. Respuesta textual: «si, hagamoslo nomás creo yo, primero haré un compact». Aún no se cambió código ni base. Cambia la decisión de `ia-docente` S4 de guardar el permiso en una tabla aparte, con visto bueno del usuario.
- L2 (2026-11-27) — Pendiente aparte, sin respuesta del usuario: en su base local el dato de tipo de discapacidad se llama «Capacidades esp» (oficial «Tipo de discapacidad»); no está en el código ni en las migraciones. No se modificó.
- L3 (2026-11-27) — Continuación («sigue»). Copia de seguridad de la base local en `~/.local/share/silabos-respaldos/silabos_ueb-antes-ia-dos-tablas-20261127-105000.dump` (permisos 600, fuera del repositorio). Datos a trasladar en local: 1 conversación del docente (2 mensajes, 6 propuestas: 5 pendientes y 1 aceptada), 17 permisos activos y nada del asistente de Administración.
- L4 (2026-11-27) — Supuestos comprobados. (a) Importar o restablecer la plantilla retira los campos y crea otros con identificadores nuevos: el permiso se lee por clave antes de retirar y se vuelve a poner después; editar, ordenar o renombrar conserva la fila. (b) El disparador `marcar_cambio_campo_plantilla` mueve `plantilla_modificada_en` con cualquier cambio de `campos_plantilla`: la migración lo limita a las columnas que ya existían (`UPDATE OF …`), sin la columna nueva. (c) El docente solo distingue «reemplazada»: se calcula al leer (hay una propuesta posterior para el mismo campo y espacio); solo se guarda `estado` para las antiguas `aceptada` o `descartada`. `huella_destino_base` solo servía para «Usar» y se quita. (d) Administración: la propuesta va en `contenido_mensaje.propuesta` con su mismo identificador y su estado; «Nuevo chat» cierra la sesión (`cerrada_en`) en lugar de ocultar mensajes. (e) La columna no guarda quién cambió el permiso (`modificado_por` no se leía en ninguna parte); se avisa al cerrar.
- L5 (2026-11-27) — Entrega en tres migraciones, una por tarea (T1, T2, T3), cada una con su traslado de datos antes de borrar.
- L6 (2026-11-27) — T1. RED: 16 pruebas fallaron antes del cambio; GREEN después. Migración en una copia de la base local: 17 permisos iguales, `plantilla_modificada_en` y `actualizado_en` de los campos sin cambios; cambiar el permiso no marca la plantilla y renombrar un campo sí. Con el código real sobre la copia: apagar y encender, importar el JSON (campos con identificadores nuevos) y restablecer el formato conservan los 17. Quedan 37 tablas del sistema tras T1.
- L7 (2026-11-27) — T2. Sobre una copia de la base local: la conversación, sus 6 propuestas (1 aceptada, 5 pendientes) y el historial para la IA se leen idénticos con el código anterior (antes de migrar) y con el nuevo (después). Con el código nuevo sobre la copia: reutiliza la conversación, impide dos pedidos abiertos y claves repetidas, marca «reemplazada» solo el mismo destino y abre otra conversación para otro sílabo. `prisma migrate diff` sin diferencias en las tablas nuevas.
