# I-12: «Contexto» pasa a llamarse rol

## Estado

Implementado y verificado el 2026-08-18. `composer verify` en verde: 154 pruebas,
1798 aserciones.

## Motivo

El producto usaba «contexto» para la combinación de rol y alcance de una sesión. El
responsable del producto reserva esa palabra para las fuentes académicas que alimentan al
asistente —los documentos que Coordinación y Administración cargan por carrera— y pidió
que no aparezca con ningún otro sentido.

El nombre anterior además inducía a error: sugería que una persona podía cambiarse de rol
a voluntad, cuando el selector solo ofrece asignaciones que un administrador ya concedió
y el servidor devuelve 404 ante una asignación ajena.

## Alcance

- Clases: `CurrentWorkContext` → `ActiveRole`; `SelectWorkContext` → `SelectActiveRole`;
  `WorkContextEligibility` → `RoleEligibility`; `AcademicWorkContextEligibility` →
  `AcademicRoleEligibility`; `WorkContextController` → `ActiveRoleController`;
  `SelectWorkContextRequest` → `SelectActiveRoleRequest`; `RequireWorkContext` →
  `RequireActiveRole`.
- Props de Inertia: `auth.contexts` → `auth.roles`; `auth.active_context_id` →
  `auth.active_role_id`. Tipo `WorkContext` → `ActiveRole`.
- Rutas: `/contexto` → `/rol`; `context.index` y `context.store` → `role.index` y
  `role.store`; alias de middleware `work-context` → `active-role`.
- Vistas: `pages/Context/Select.vue` → `pages/Role/Select.vue`; los textos visibles dicen
  rol.
- Auditoría: la acción `work_context.selected` pasa a `active_role.selected`.
- Base de datos: `eventos_auditoria.contexto` → `eventos_auditoria.metadatos`, porque esa
  columna guarda metadatos del evento y no tenía relación con el rol.
- Documentación: glosario, modelo de dominio, roles, pantallas, trazabilidad y planes.
  `CONTEXT_STATUS.md` pasa a `DECISIONS_STATUS.md`.
- Pruebas: `WorkContextTest` → `ActiveRoleTest`.

## Lo que no se renombró, y por qué

- La sección `## Contexto` de los ADR: es la estructura estándar de un registro de
  decisión y no se refiere ni al rol ni a las fuentes.
- `docs/architecture/ai-service.md` menciona «contexto académico mínimo» al describir lo
  que se envía al modelo. Ese uso coincide con el sentido que el responsable del producto
  reserva para la palabra, así que se conserva.
- La migración `000002` sigue creando la columna con el nombre original y la `000011` la
  renombra: se conserva la historia en vez de reescribirla.

## Trazabilidad

- RF-001..007; RN-001..004; CU-01 y CU-02; UI-02.
- No cambia autorización, alcance ni ciclo de vida: es un cambio de nombre.

## Pendiente relacionado

El selector sigue mostrándose a quien tiene un solo rol, que hoy son las tres cuentas de
prueba. Ocultarlo y activar el único rol elegible al entrar queda a decisión del
responsable del producto.
