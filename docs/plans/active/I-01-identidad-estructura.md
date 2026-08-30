# I-01: Identidad, rol y estructura académica

## Estado

Implementado y verificado automáticamente. En espera de la revisión manual de interfaz
para cerrar; ver `docs/plans/pending-work.md`. `composer verify` en verde el 2026-08-26:
204 pruebas y 2148 aserciones.

El 2026-08-26 se añadió la contraseña temporal de un solo uso: la interfaz la genera, la
cuenta nace marcada y `RequirePasswordChange` bloquea toda ruta salvo el panel, el cambio
y el cierre de sesión hasta que su titular la sustituya.

La distribución de responsabilidades descrita originalmente en este incremento fue
reemplazada por I-09: Administración conserva gobierno global y Coordinación gestiona la de responsabilidades descrita originalmente en este incremento fue
reemplazada por I-09: Administración conserva gobierno global y Coordinación gestiona la
operación académica dentro de su carrera.

## Trazabilidad

- RF-001 a RF-016; RN-001 a RN-008; CU-01 a CU-03.
- UI-01 a UI-04; ADM-02 a ADM-04.
- PV-05 no bloquea identidad ni maestros; limita la capacidad institucional en I-03.
  PV-06 quedó cerrada y fija un sílabo por paralelo. PV-09 y PV-10 bloquean el adaptador
  institucional final de I-07, no el catálogo local con identificadores externos opcionales.
- La política de cuentas usa el valor temporal reversible DT-01: cuentas administradas
  y registro público desactivado.
- La contraseña temporal la genera la interfaz con `crypto.getRandomValues` cumpliendo la
  política del servidor, se muestra en claro para entregarla y no se confirma: nadie la
  escribe. No se guarda en auditoría ni en logs.
- Las credenciales se envían por correo al crear la cuenta, en cola y después del commit:
  crear una cuenta no espera al servidor de correo ni falla si está caído. El transporte
  sigue en `log` mientras `PV-15` esté abierta, así que nada sale del sistema todavía.
- Corregir el nombre y el correo de una cuenta es `updateProfileData`, distinto de
  `update`, que gobierna estado y roles. La administración alcanza a cualquiera; una
  coordinación, solo a los docentes con rol vigente en su carrera. El valor anterior del
  correo queda en auditoría porque es la identidad con la que se inicia sesión.
- Esa contraseña es de un solo uso. La cuenta nace marcada y `RequirePasswordChange`
  rechaza toda ruta salvo el panel, el propio cambio y el cierre de sesión; sobre el
  panel aparece un diálogo que no se descarta. El bloqueo es del servidor: un diálogo que
  solo viviera en el navegador se esquivaría escribiendo la URL a mano. El primer cambio
  apaga la marca y deja el evento `user.temporary_password_changed` en auditoría, sin el
  valor.
- La cuenta administradora sembrada no nace marcada: si lo estuviera, una instalación
  nueva no tendría por dónde crear la primera cuenta.

## Resultado demostrable

Un administrador, dentro de un rol explícito, gestiona cuentas, roles, facultades,
carreras y coordinaciones. Un Coordinador gestiona la estructura operativa de su carrera.
Una persona con varios roles cambia de rol sin acumular privilegios. PostgreSQL
conserva historial y rechaza vigencias incompatibles.

## Casos de uso

### CU-02 — Gestionar usuarios y roles

- Actor: Administrador con asignación vigente seleccionada.
- Flujo: filtra cuentas, crea una cuenta, asigna roles con carrera y vigencia, activa o
  desactiva sin borrar historial.
- Errores: cuenta duplicada, carrera inactiva, vigencia inválida, rol ajeno y
  auto-desactivación.
- Efecto: mutación transaccional, sesiones revocadas al desactivar y evento de auditoría.
- Evidencia: `ManagedUserTest` y pantallas ADM-02/ADM-03.

### CU-03 — Gestionar estructura académica

- Actor: Administrador o Coordinador con rol vigente, según la entidad.
- Flujo Administrador: mantiene facultad, carrera, periodo, campus, modalidad y
  coordinación.
- Flujo Coordinador: mantiene malla, materias por ciclo, ofertas, paralelos y asignaciones
  docentes dentro de su carrera.
- Errores: duplicidad, referencias inactivas, fechas inválidas y coordinación solapada.
- Efecto: se archiva/desactiva; no se elimina una entidad histórica.
- Evidencia: pruebas de políticas, restricciones PostgreSQL e interfaces ADM-04 y
  COR-13..15.

## Cambios previstos

- Dominio: roles y alcances efectivos; catálogo académico y vigencias.
- Backend: Form Requests, Policies y acciones transaccionales por rebanada.
- Datos: UUID de aplicación, `timestamptz`, claves únicas, checks y exclusiones GiST.
- Frontend: rol activo, usuarios/roles y estructura con filtros y errores accionables.
- Seguridad/auditoría: autorización en servidor, revocación de sesiones y eventos append-only.
- Trabajos/integraciones: fuera de esta unidad; el adaptador institucional queda para I-07.

## Pruebas

- rol propio, ajeno, vencido y acumulación de roles;
- crear, filtrar, asignar rol, desactivar y preservar historial;
- impedir acceso horizontal y auto-desactivación;
- restricciones de vigencia y coordinación en PostgreSQL;
- CRUD académico, desactivación y referencias estables;
- lint, tipos, análisis estático, suite PostgreSQL y build.

## Pasos

- [x] Crear esquema base de identidad y estructura.
- [x] Implementar selección explícita de rol.
- [x] Implementar gestión de cuentas, estado y roles.
- [x] Completar detalle/historial de roles ADM-03.
- [x] Implementar mantenimiento académico ADM-04.
- [x] Actualizar trazabilidad y documentación operativa.
- [x] Ejecutar verificación automatizada completa y registrar evidencia.
- [ ] Completar revisión manual de teclado, lector, 360 px y modos claro/oscuro.

## Riesgos y reversión

- Los identificadores institucionales definitivos siguen en PV-10: se mantienen opcionales
  o de fixture y no se fusionan registros automáticamente.
- Las cantidades reales siguen en PV-05: no se fijan límites de negocio prematuros.
- La separación por paralelo quedó fijada al cerrar PV-06; I-01 solo registra ofertas y
  paralelos.
- Las migraciones son aditivas; cualquier cambio de alcance se hará con otra migración.

## Evidencia de cierre

- `ManagedUserTest`: 10 pruebas, 58 aserciones en ejecución focalizada.
- `AcademicStructureTest` y restricción de coordinación cubren además el reparto I-09,
  publicación por carrera, ciclo curricular y ataques con IDs laterales.
- Puerta global `composer verify`: 72 pruebas, 295 aserciones y build aprobado.
- Pendiente solo la matriz manual de interfaz y la evidencia CI remota.
