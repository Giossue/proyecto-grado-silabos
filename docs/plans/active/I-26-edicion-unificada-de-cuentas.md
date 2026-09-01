# I-26: Edición unificada de cuentas en ADM-02

## Estado

Implementado y verificado localmente el 2026-09-01 (pruebas de Identity, pruebas
arquitectónicas del listado, Pint, ESLint, Prettier y vue-tsc en verde).

## Trazabilidad

- RF-003..006; RN-001..004; CU-02; UI-04 y ADM-02.
- No depende de una decisión `POR VALIDAR`: no cambia permisos, estados ni reglas de
  negocio; solo reúne en una superficie las mutaciones ya existentes.

## Resultado demostrable

El menú de tres puntos de cada fila de `admin/usuarios` ofrece una sola opción
«Editar», que abre el panel «Editar cuenta» con identidad (nombre y correo), estado
(cuenta activa) y una asignación de rol opcional, todo guardado con una única acción.
Antes eran tres opciones separadas: «Editar datos», «Asignar rol» y
«Desactivar/Activar cuenta».

## Cambios

- Backend: `PATCH admin/usuarios/{user}` (`users.update`) con
  `UpdateManagedUserRequest` y `ManagedUserController::update`, que orquesta en una
  transacción los casos de uso existentes `UpdateManagedUserProfile`, `AssignRole` (solo
  si llega el bloque de rol) y `SetUserStatus` (solo si el estado cambia, y al final,
  para que una desactivación cierre un nombramiento concedido en el mismo guardado).
- Autorización sin cambios de política: identidad con `updateProfileData` (admite la
  propia cuenta); estado y rol exigen además `update`, que excluye la autogestión. El
  panel oculta esas secciones al editar la propia cuenta.
- Frontend: nuevo `ManagedUserEditSheet` (FormSheet + pie fijo «Guardar cambios»); el
  bloque de rol es de adhesión explícita («Asignar otro rol») para que guardar no
  multiplique asignaciones. `Admin/Users/Index.vue` deja de montar `UserProfileSheet`,
  `RoleAssignmentSheet` y el formulario de estado en el menú.
- ADM-03 (detalle) conserva sus acciones separadas de cabecera; los endpoints
  `users.profile.update`, `users.roles.store` y `users.status.update` siguen vigentes
  para esa pantalla.

## Pruebas

- `ManagedUserUpdateTest`: guardado combinado de identidad y estado; alta de rol en el
  mismo guardado sin sobrescribir historial; guardado sin cambios de estado/rol no
  registra eventos ni asignaciones extra; la propia cuenta solo corrige identidad (403
  al tocar estado o rol); Coordinación excluida; carrera obligatoria en roles con
  alcance; una desactivación cierra el nombramiento concedido en el mismo guardado.
- `ManagementCreationUiTest` («edita cuentas desde una sola accion del listado de
  usuarios»): protege la opción única y el contenido del panel.
- Matriz actualizada en `docs/quality/traceability.md` (fila «Usuarios, roles y
  vigencias»).

## Riesgos y reversión

- Sin migraciones ni cambios de esquema; los casos de uso y su auditoría son los ya
  existentes. Revertir restaura las tres opciones del menú y elimina la ruta unificada.
