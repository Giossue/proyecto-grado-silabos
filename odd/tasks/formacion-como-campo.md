# Formación del docente como campo de la plantilla

Objetivo: la formación y experiencia del docente deja de ser un atributo del usuario y pasa a ser un campo más de la plantilla, con arrastre de valores entre sílabos.
Rama: `main` (repositorio privado). Entrega: commits por unidad. Pruebas: Vitest, typecheck, lint; E2E de las pantallas tocadas y la suite completa al cerrar.

## Specs

- S1. «Esto creo que mejor no lo ponemos en la bd como un atributo en la tabla, sino como un campo más, qué opinas? y así manteniendo lo que ya existe no? SI es que no hubo cambios en algún campo en el formato entonces se sigue manteniendo como tal» → decisión: «Hacerlo campo de la plantilla».
- S2. Arrastre: «Del último sílabo del docente (Recomendado)»: cualquier materia o período; lo que el docente escribió por última vez en ese mismo campo, si la definición del campo no cambió.
- S3. Dos docentes: «Se juntan las de ambos (Recomendado)»: al arrastrar, el campo arranca con la última formación de cada docente, una debajo de la otra; luego se puede editar.
- S5. Ubicación: «En el mismo lugar (Recomendado)»: el docente la escribe como campo, pero el Word/PDF la sigue mostrando en las mismas filas de la tabla de identificación; el documento se ve igual que hoy.
- S6. Docente con formación y sin sílabo: «Se pierde, la vuelve a escribir (Recomendado)»; queda en el respaldo de la base.
- S4. Se mantiene lo que existe: las formaciones guardadas en los usuarios pasan a ser el valor inicial; los sílabos enviados o aprobados no cambian (instantánea y SHA-256 intactos); deja de existir la columna `usuarios.formacion_experiencia_usuario` y la pestaña «Perfil docente».

## Diseño (decidido tras F1)

- D1. Campo real `formacion_docente` en la sección `identificacion` (tras `asignatura`), «Formación y experiencia académica-investigativa», llenado por el docente; excluido del perfil de asignatura de Coordinación y de la ficha Excel; obligatorio para enviar como los demás campos del docente (reemplaza `formacion_docente_faltante`). La plantilla marca el campo en su definición (clave nueva permitida en `templateDefinition.ts`), sin migración del `CHECK` de `quien_llena`.
- D2. Documento igual: la variable `formacion_docente` sigue en la tabla de identificación; su valor sale del valor del campo `formacion_docente` del sílabo (texto) y el campo no se dibuja otra vez como bloque propio. Las instantáneas viejas (y las de Laravel) siguen mostrándose igual.
- D3. Arrastre: columna nueva `valores_campo.huella_definicion_campo` (SHA-256 de la definición del campo, con `definitionHash`) escrita en cada guardado/generación/adaptación/copia; al generar o iniciar un sílabo, si el campo está vacío, toma el último valor no vacío del mismo `clave_campo_plantilla` y la misma huella, de los sílabos de cada docente vigente (por `silabos.guardado_en desc`); varios docentes se juntan uno debajo del otro sin repetir.
- D4. Migración Prisma `20261125220000_formacion_como_campo` (una transacción; Drizzle ya no existe, ver L5): inserta campo y definición, restaura `plantilla_modificada_en` (para que reanudar no adapte ni devuelva a borrador), crea los valores en los sílabos vivos (no enviados: formación del docente vigente; enviados/aprobados: `identification.formation` de su última revisión), llena las huellas, y elimina `usuarios.formacion_experiencia_usuario`. Revisiones, aprobaciones e instantáneas no se tocan. Si la plantilla no tiene la variable, la migración no rompe.
- D5. Se elimina «Perfil docente» (página, ruta, pestaña, diálogo, `useTeacherFormation`), `PUT /authentication/formation`, `teacherFormationSchema`, `formation` en la sesión, el modal que bloqueaba el envío y la ayuda que lo menciona.

## Tasks

| ID | Specs | Ruta | Estado | Commit |
|---|---|---|---|---|
| F1 | S1-S6 | explorador (lectura) | hecho: mapa (ver L2) | — |
| F2 | S1-S6, D1-D5 | escritor delegado (respaldo de contexto: sesión muy larga) | hecho: código, pruebas, docs y migración aplicada a `silabos_ueb` tras ensayo en PG18 desechable (ver L5); E2E pendiente (puertos ocupados) | sin commit (el padre hace git) |
| F3 | S1-S6 | verificador independiente (riesgo 1: migración que borra una columna) | pendiente | — |

## Log

- L1 (2026-11-25): pedido del usuario (S1) con captura de «Configuración › Perfil docente › Formación y experiencia académica». Se le explicó el diseño actual (columna en `usuarios`, variable del sistema `formacion_docente` con fuente `identification.formation`, unión de varios docentes, valor congelado al enviar) y la propuesta; respondió S2, S3 y «Hacerlo campo de la plantilla».
- L2: F1. Hechos: la identidad del campo es `clave_campo_plantilla`; editar un campo sobrescribe su definición sin rastro; cualquier cambio de plantilla actualiza `plantilla_modificada_en` y al reanudar `adaptToTemplate` devuelve a borrador los enviados/aprobados y borra su historial (por eso el cambio va por migración); hoy cada paralelo tiene un solo docente vigente (S3 queda preparado); base local: 4 docentes con formación (uno sin sílabo), 22 sílabos (19 sin iniciar, 3 borrador), 0 revisiones.
- L3 (2026-11-25): «En el mismo lugar (Recomendado)» y «Se pierde, la vuelve a escribir (Recomendado)» → S5, S6 y diseño D1-D5.
- L4 (2026-11-25): respaldos previos en `respaldos/silabos-antes-formacion-como-campo-20261125-110051.dump` y `respaldos/formacion-usuarios-20261125-110051.csv`. El escritor de F2 se detuvo antes de cambiar nada (sin archivos tocados; base intacta: la columna sigue, sin campo ni huellas). Retomar F2 cuando el usuario vuelva.
- L5 (2026-11-25): F2 hecho por el escritor delegado. El usuario reconfirmó: «la formación ponle como digo en un campo». D4 pasa a migración Prisma porque Drizzle se quitó.
  - Código: campo `formacion_docente` en «Identificación» tras `asignatura` («Formación y experiencia académica-investigativa», `carrera`); clave nueva `teacher_fields` en la definición (validada, exportada en el JSON y en `plantilla.schema.json`, y en `officialTemplate.json`); `profileFields` excluye los campos del docente (perfil de asignatura y ficha Excel); `identification.formation` sale del valor del campo (`formationOf`), la instantánea no dibuja ese campo como bloque; huella `definitionHash` en cada guardado, inicio, copia, adaptación, cambio de perfil y generación; arrastre `carryTeacherFields` al generar e iniciar (último valor no vacío por docente vigente, `silabos.guardado_en desc`, misma clave y huella; varios docentes uno debajo del otro sin repetir). Se quitaron `formacion_docente_faltante`, `teacher_formation_required`, `PUT /authentication/formation` (404, en `REMOVED_ROUTES`; 194 rutas), `teacherFormationSchema`, `formation` en la sesión, «Perfil docente» (página, ruta, pestaña, diálogo, `useTeacherFormation`) y el modal del envío. La vista previa del docente no repite el campo y vuelve a leer el sílabo si la formación cambió. Ayuda y `docs/sistema.md` al día.
  - Respaldos: `respaldos/silabos-antes-formacion-como-campo-20261125-211711.dump` y `respaldos/formacion-usuarios-20261125-211711.csv` (38 usuarios, 4 con formación; md5 igual a la columna antes de aplicar).
  - Ensayo en PostgreSQL 18 desechable (podman, restaurado del respaldo; también una copia con un sílabo `en_revision` y otro `aprobado` sintéticos): campo y definición insertados; 27/27 sílabos con valor (22 con texto; los enviados tomaron `identification.formation` de su última revisión); 432/432 huellas, iguales a `definitionHash` en JS; columna eliminada; revisiones (md5 igual), aprobaciones, firmas, exportaciones y los 465 valores previos sin cambios (md5 igual); `plantilla_modificada_en` restaurado; sin funciones auxiliares sobrantes. Contenedor eliminado.
  - `silabos_ueb`: mismo resultado que el ensayo (diff idéntico). Verificación: `pnpm typecheck` y `pnpm lint` limpios; API 2179, web 995 y shared 147 pruebas en verde. E2E sin correr (puertos 8000/3000 ocupados por los servidores de desarrollo): queda para el padre (`account.spec.ts`, `syllabus-lifecycle.spec.ts`, `support/syllabus.ts`).

