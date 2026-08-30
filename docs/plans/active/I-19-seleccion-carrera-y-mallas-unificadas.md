# I-19 — Selección de carrera y mallas unificadas

## Estado

Implementación y verificación automatizada concluidas el 2026-08-30. El cierre formal
permanece sujeto a la revisión manual de cards, `Sheet`, teclado, lector de pantalla y
dispositivos reales indicada por `PV-19`.

## Objetivo

Hacer explícito el alcance de carrera cada vez que una persona entra como Coordinador y
concentrar materias, desglose y constructor dentro de cada versión de malla.

## Decisión confirmada

El responsable del producto confirmó el 2026-08-30 que una persona puede coordinar más
de una carrera. Al iniciar una sesión como Coordinador debe elegir la carrera mediante
cards, aunque solo tenga una coordinación vigente. Durante la sesión puede cambiar a
otra carrera o rol elegible desde el menú de usuario.

La colección independiente `/coordinacion/materias` deja de ser una pantalla de trabajo:
las materias se consultan y mantienen dentro de la malla a la que pertenecen. El listado
de mallas usa cards y cada una abre un detalle con dos apartados: desglose académico y
constructor visual.

## Trazabilidad

- RF-001..016; RN-001..008; CU-01..03.
- UI-02 y COR-13.
- CP-F identidad, selección explícita, alcance lateral, sesión, auditoría, estructura e
  inmutabilidad.
- No depende de una puerta `PV` ni amplía permisos.

## Diseño

- `asignaciones_rol` continúa siendo la fuente del rol y la carrera elegibles; no se crea
  una preferencia paralela ni se amplía la sesión a varias carreras a la vez.
- Un único rol no se activa automáticamente cuando es Coordinador. Administrador y
  Docente conservan la activación automática si solo tienen una opción.
- El selector inicial presenta cada asignación elegible como card y el menú de usuario
  abre un `Sheet` con las mismas opciones. Ambos llaman al mismo caso de uso auditado.
- Cambiar carrera sustituye el identificador de asignación activo y vuelve al panel del
  nuevo alcance.
- `/coordinacion/materias` redirige a Mallas para conservar enlaces antiguos sin mantener
  una segunda interfaz.
- El detalle de malla usa el mismo contrato para el desglose por formulario/tablas y el
  constructor Vue Flow.

## Criterios de aceptación

- Un Coordinador recién autenticado elige carrera incluso si solo coordina una.
- Solo se muestran coordinaciones vigentes y elegibles de la persona autenticada.
- El cambio desde el menú no permite seleccionar IDs ajenos o vencidos y queda auditado.
- La navegación de Coordinación muestra una sola entrada **Mallas** y no **Materias**.
- Mallas se presenta como cards y cada card abre desglose y constructor.
- La antigua ruta de Materias redirige a Mallas.
- El detalle y todas sus mutaciones conservan alcance por carrera e inmutabilidad.

## Verificación

- `ActiveRoleTest` verifica entrada, cambio, alcance y auditoría; `ManagedUserTest`
  demuestra que Administración puede asignar a una persona una segunda coordinación.
- `AcademicStructureTest` verifica detalle, aislamiento por carrera y redirección de la
  ruta anterior de Materias.
- `ManagementCreationUiTest` protege cards, dos apartados, navegación y composición
  shadcn-vue.
- `composer verify`: escaneo de secretos, ESLint, Prettier, TypeScript, Pint, Larastan,
  265 pruebas con 2.536 aserciones y build Vite en verde.
- En el entorno local se aplicó únicamente la migración aditiva `000017`; la migración
  destructiva `000016` permanece pendiente de una ejecución autorizada aparte.

## Riesgos y reversión

- El cambio de carrera invalida visualmente la página anterior al redirigir al panel; no
  conserva datos de otra carrera en props compartidos.
- La ruta antigua solo redirige y puede recuperarse si una necesidad futura demuestra
  que Materias requiere colección propia.
- La validación manual de cards, `Sheet`, foco y móvil permanece dentro de `PV-19`.
