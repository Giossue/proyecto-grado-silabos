# I-64: Historial de programaciones por período

## Estado

Implementado el 2026-09-09.

## Problema

COR-14 mezcla en una sola tabla las programaciones de todos los períodos. Cada período
nuevo aumenta el listado y repite las mismas materias sin separar el trabajo vigente de
la consulta histórica. Además, alcanzar `fecha_fin` no protege por sí solo las
programaciones y paralelos anteriores.

## Trazabilidad

RF-007..016, RN-005..008, CU-03, COR-14..15 y CP-F estructura académica. La decisión fue
confirmada por el responsable del producto el 2026-09-09. No depende de una puerta `PV`.

## Decisión

- El estado temporal del período se deriva en la zona `America/Guayaquil`:
  **Próximo**, **En curso** o **Finalizado**.
- COR-14 selecciona un solo período y conserva la selección en la URL. Si no se pide
  uno, abre el período en curso; en su ausencia, el próximo más cercano y finalmente el
  último período disponible.
- Los períodos finalizados y sus programaciones, paralelos, asignaciones y sílabos se
  conservan para consulta.
- Una programación, paralelo o asignación docente de un período finalizado no se crea,
  edita, elimina ni cambia de estado. La regla se aplica en casos de uso del servidor.
- Preparar período solo admite períodos activos que no hayan finalizado.
- No se añade una columna de estado persistida ni una tarea de cierre: las fechas son la
  fuente de verdad.

## Implementación

1. [x] Centralizar clasificación y protección temporal del período.
2. [x] Exponer estado, etiqueta, capacidad de planificación y período seleccionado desde la
   consulta de estructura académica.
3. [x] Añadir selector y estado visible en **Materias y paralelos**, mostrando únicamente
   las filas del período elegido.
4. [x] Abrir **Preparar período** en el período operativo seleccionado y excluir períodos
   finalizados.
5. [x] Proteger preparación, programaciones, paralelos, asignaciones docentes y relevos en
   servidor.
6. [x] Cubrir selección predeterminada, historial de solo lectura y mutaciones directas.
7. [x] Actualizar decisiones, pantallas, permisos, dominio y trazabilidad.

## Evidencia de verificación

- Pruebas focalizadas: 75 aprobadas y 1.905 aserciones en `AcademicStructureTest`,
  `ManagementCreationUiTest`, `TeacherTransferTest` y `TeacherReliefTest`.
- `composer verify`: escaneo de secretos, ESLint, Prettier, TypeScript, Pint y PHPStan
  aprobados; 403 pruebas y 6.024 aserciones aprobadas sobre PostgreSQL; compilación Vite
  de producción aprobada.
- La revisión estática cubre selector, etiqueta temporal, vacío por período, exclusión de
  períodos finalizados en **Preparar período** y acciones de solo lectura. La comprobación
  manual en navegador queda dentro de la revisión de aceptación pendiente de COR-14.
- No existe migración ni operación de datos local o remota: `fecha_inicio`, `fecha_fin` y
  `activo` ya son la fuente suficiente. La reversión consiste en retirar esta unidad de
  código y documentación, sin recuperar ni transformar datos.
