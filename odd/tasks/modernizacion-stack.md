# Modernización del stack nuevo

Objetivo: reemplazar lo que se copió de Laravel byte a byte por las herramientas estándar del stack nuevo, sin cambiar lo que ve el usuario.
Rama: `main` de `web/` (sin remote, sin push). Entrega: commits por unidad. Pruebas: Vitest y la suite E2E de Playwright (`npm run test:e2e`) como red de seguridad.

## Specs

- S1. Validación con **Zod**: un mismo esquema para el formulario y el servidor; reemplaza el validador que imita a Laravel. Mensajes en español iguales a los actuales.
- S2. Formularios con **react-hook-form + Zod** usando el `Form`/`Field` de shadcn.
- S3. Datos del cliente con **TanStack Query** (caché, reintentos, invalidación tras mutaciones); reemplaza el `fetch` propio y las «signals» de datos.
- S4. **Consultas y relaciones de Drizzle** en lugar de SQL escrito a mano donde sea posible; **migraciones Drizzle reales** que creen una base nueva desde cero.
- S5. **JSON normal** de Next.js (sin escapes ni sangrías al estilo PHP) y **React Email** para los correos.
- S6. **Better Auth** (o Auth.js) para login, 2FA y sesiones, al final; cerrar las sesiones abiertas una vez es aceptable.
- S7. Se mantienen: el armado del Word del sílabo (idéntico al de Laravel), Gotenberg para PDF, componentes reutilizables y textos visibles.

Orden propuesto (aceptado): 1) Zod + react-hook-form, 2) TanStack Query, 3) Drizzle, 4) JSON normal y React Email, 5) Better Auth.

## Tasks

| ID | Specs | Ruta | Estado | Commit |
|---|---|---|---|---|
| M1 | S1, S2 | delegada (en paralelo con M3) | hecho (parcial): esquemas Zod compartidos, formularios con react-hook-form, validación del servidor con Zod | — |
| M3 | S4 | delegada (en paralelo con M1) | hecho: consultas y relaciones Drizzle, migraciones reales | — |
| M2 | S2, S3 | delegada (en paralelo con M4) | en curso: TanStack Query, los 16 formularios restantes y E2E independiente del orden | — |
| M4 | S5 | delegada (en paralelo con M2) | en curso: JSON normal (salvo codificadores canónicos de firmas y huellas) y React Email | — |
| M5 | S6 | por definir | pendiente: Better Auth | — |

## Log

- L1 (2026-11-24): «una duda, con qué se hace ahora lo de la plantilla?…» → «prendelo y una duda, no había cosas ya mejores que se podría usar ahora que cambiamos de stack?» → se propuso la tabla de reemplazos y el orden 1) Zod + react-hook-form, 2) TanStack Query, 3) Drizzle, 4) JSON normal y React Email, 5) Better Auth → «ok, empecemos, me gusta».
- L2: M3 (51bb0ba): esquema completo en `src/db/schema/`, línea base regenerada con funciones y disparadores, `db:migrate` + `db:seed` crean base desde cero (probado en base de prueba), relaciones, 13 de 42 archivos de consultas pasados a Drizzle (29 pendientes). Las bases existentes no cambian.
- L3: M1: `src/schemas/` (mensajes, reglas, correo, contraseña, auth, 2FA, cuenta, personas), `src/lib/forms.ts` (`useSchemaForm`, `applyApiErrors`), `server/http/schemaValidation.ts`; migrados a Zod + react-hook-form login, recuperación, restablecimiento, activación, 2FA, perfil, seguridad, perfil docente, sesiones y usuarios administrados (cliente y servidor). Pendientes: 32 archivos del servidor con el validador viejo y los formularios de Administración (catálogos, periodos), Coordinación, sílabo, plantilla y `ApiForm`. Mismos 422 y mensajes. E2E: 3 fallos que también ocurren en HEAD (notificaciones sin avisos sin leer, copia de paralelo dependiente de otra suite, periodo nuevo bloqueado por una carrera importada sin coordinador): son de las pruebas, no del código.
- L4: M1 segunda vuelta: los 32 archivos del servidor usan Zod (`src/schemas/fields.ts` y módulos por área); `server/http/validation.ts` borrado; comparación vieja/nueva en ~45 000 entradas al azar: mismos mensajes y orden. Formularios migrados además: devolución de Biblioteca, corrección de Coordinación, reinicio del sílabo, prórroga, configuración de la malla; `ApiForm` borrado (sin uso). Pendientes en el cliente: 16 formularios (catálogos, convocatorias, firma, catálogo de biblioteca, malla visual, paralelos, documentos de apoyo, herramientas de la plantilla, asistente, perfil docente) y `SyllabusProcessDialog` (su prueba espera enviar un formulario vacío). E2E arreglados (notificaciones, copia de paralelo, periodo nuevo): suite completa 84 pasan, 0 fallan, 3 omitidas por falta de datos. Observación de producto: un paralelo creado con la convocatoria abierta no recibe sílabo hasta pausar y reanudar (igual que antes).
- L5: M3 segunda vuelta: los 29 archivos restantes usan el constructor de consultas de Drizzle; queda SQL crudo solo donde Drizzle empeora (joins laterales, CASE jsonb, fragmentos de filtro compartidos, SAVEPOINT/SET LOCAL). `provisionOfficialTemplate` usa el `buildStructure` compartido. Comparación vieja/nueva: ~4 400 lecturas idénticas byte a byte y 75 escrituras con volcados iguales. E2E: 81 pasan; 2 fallos que dependen del orden y los datos (pasan solos y fallan igual en HEAD). Las capas de consulta no tienen pruebas unitarias con base de datos: solo las cubre el E2E.
