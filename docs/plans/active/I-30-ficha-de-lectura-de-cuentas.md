# I-30: Ficha de lectura de cuentas en ADM-02

## Estado

En curso.

## Trazabilidad

- RF-003..006; RN-001..004; CU-02; UI-04 y ADM-02.
- No depende de una decisión `POR VALIDAR`: no cambia permisos, estados, rutas ni reglas
  de negocio; solo lee datos que la Administración ya puede consultar.

## Resultado demostrable

El menú de tres puntos de cada fila de `admin/usuarios` ofrece «Ver» además de
«Editar». «Ver» abre un panel derecho de solo lectura con la ficha completa de la
cuenta: estado y su explicación, nombre, correo, cédula cuando existe, fecha de
creación, fecha de desactivación cuando aplica, acceso en dos pasos, roles vigentes con
su alcance y los roles archivados que se conservan como historial.

## Cambios previstos

- Backend: `ManagedUserController::index` envía por fila los datos de la ficha
  (`identity_document`, `created_at`, `deactivated_at`, `two_factor_enabled`) y todas
  las asignaciones, vigentes y archivadas. Las columnas Rol y Carrera siguen mostrando
  solo las vigentes, que ahora se filtran en memoria sobre la relación ya cargada.
- Frontend: nuevo `ManagedUserDetailSheet` (Sheet de solo lectura, sin pie de acciones
  porque no guarda nada) y su opción «Ver» en `TableActionsMenu`. El tipo de la fila
  vive junto al panel y `Admin/Users/Index.vue` lo reutiliza.
- Datos, seguridad/auditoría y trabajos: sin cambios. La lectura no crea eventos.

## Pruebas

- `ManagedUserTest`: la lista envía la ficha completa y separa asignaciones vigentes de
  archivadas.
- `ManagementCreationUiTest`: el listado ofrece «Ver» junto a «Editar» y el panel de
  lectura no monta formularios.
- Formato, ESLint y comprobación de tipos de Vue.

## Pasos

- [x] Enriquecer el listado con los datos de la ficha y el historial de roles.
- [x] Crear el panel de lectura y su opción en el menú de acciones.
- [x] Cubrir la regresión, actualizar trazabilidad y verificar.

## Riesgos y reversión

- La consulta carga también las asignaciones archivadas de las 20 filas de la página; se
  mantiene una sola consulta con `with`, sin N+1.
- Revertir elimina la opción y el panel; no hay migraciones ni efectos persistentes.
