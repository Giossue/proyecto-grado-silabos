# I-54: Alta de docentes desde Coordinación

## Autoridad y alcance

Solicitud explícita del responsable del producto, 2026-09-06: Coordinación puede crear
docentes para su carrera activa; Administración conserva sus capacidades actuales.
Amplía exclusivamente el alta/incorporación con rol Docente. La corrección de identidad,
otros roles, reenvío de credenciales y desactivación global siguen bajo Administración.

RF-003..007, RF-008..016; RN-001..008; CU-02, CU-03; COR-15 y ADM-02;
RNF-001..010 y RNF-018..023; CP-F identidad/alcance/atomicidad y CP-N seguridad/UX.
PV-12/PV-15 conservan su autoridad para datos reales y correo externo; las pruebas
usan datos sintéticos y correo falso. No afecta PV-16 ni autoriza envío manual de correos.

## Decisiones de implementación

- El servidor deriva la carrera de la coordinación efectiva en sesión y fija Docente;
  rechaza campos que pretendan elegir carrera, rol, identidad objetivo o estado.
- Reutiliza el formulario y el caso de uso administrativo para cuentas nuevas, con
  contraseña temporal, cambio obligatorio, auditoría y correo después del commit.
- Un correo existente incorpora la misma cuenta activa a la carrera; conserva nombre,
  correo, contraseña, sesiones y roles previos. Sin directorio global de cuentas.
- La repetición no duplica cuenta/rol, auditoría de incorporación ni correo.
- Una cuenta inactiva o un rol Docente revocado en esa carrera requiere Administración:
  el alta delegada no revierte una baja. Es una restricción conservadora del permiso.
- Crear/incorporar no asigna paralelos ni modifica sílabos: está disponible durante el
  proceso, igual que las altas administrativas. Las asignaciones académicas mantienen
  sus bloqueos de convocatoria. Se conservan los endpoints administrativos.
- COR-15 presenta una sola acción **Gestionar docente**. Su menú abre el alta o la
  asignación en hojas independientes, sin mezclar sus permisos ni transacciones.
- Sin migraciones: se reutilizan identidad y rol por carrera con sus constraints.

## Plan y aceptación

- [x] Permiso dedicado, Form Request, acción transaccional y endpoint de Coordinación.
- [x] Formulario compartido con rol/carrera fijos; errores y confirmación visibles.
- [x] Pruebas de creación/reutilización, repetición, correo, rollback, alcance, roles
      acumulados, revocaciones, entradas manipuladas y compatibilidad administrativa.
- [x] Verificación específica, documentación, decisiones y trazabilidad actualizadas.

## Evidencia y limitaciones

Pint, PHPStan, tipos Vue/TypeScript, ESLint y Prettier de los dos componentes cambiados,
y compilación de producción correctos. Suite de identidad y contrato de formularios
ejecutada con PostgreSQL de pruebas y correo falso; incluye rollback tras fallo de auditoría.
`composer verify` se intentó, pero se detuvo en nueve errores ESLint preexistentes de
`temp/.venv/.../emscripten_fetch_worker.js`, ajeno a este cambio. No se declara aprobada
la puerta global. No se realizó validación visual en navegador ni prueba de concurrencia
multiproceso; la incorporación usa bloqueo de cuenta e índice único existentes.

La unificación visual de alta y asignación se verificó con 73 pruebas y 1831 aserciones,
además de Pint, Prettier, TypeScript y ESLint focalizado.
