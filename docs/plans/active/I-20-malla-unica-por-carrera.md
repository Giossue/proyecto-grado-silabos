# I-20 — Malla única por carrera

## Estado

Implementación y verificación automatizada focalizada concluidas el 30 de agosto de 2026. El cierre formal permanece sujeto a la revisión manual de interfaz indicada por
`PV-19`.

## Trazabilidad

- RF-008..016; RN-005..008; CU-03.
- UI-02 y COR-13..15.
- CP-F: alcance por carrera, estructura académica, auditoría, continuidad histórica y
  alternativa accesible al constructor visual.
- Sustituye las decisiones de I-16, I-18 e I-19 que exponían varias versiones de malla,
  publicación e inmutabilidad de una versión completa.

## Resultado demostrable

Cada carrera dispone de cero o una sola **Malla** actual. Coordinación la crea, edita
sobre la misma estructura, deshabilita, reactiva o elimina cuando no tiene dependencias.
La pantalla deja de mostrar buscador, filtros, cards, paginación, números de versión y
acciones de publicación.

Si una carrera no tiene una malla activa, no se pueden crear ofertas ni abrir procesos
nuevos para sus docentes y materias. Los sílabos y revisiones existentes conservan el
contexto académico con el que fueron creados y continúan disponibles aunque la malla
actual se deshabilite o cambie.

## Decisiones y supuestos

- La decisión fue confirmada por el responsable del producto el 30 de agosto de 2026.
- `versiones_malla` permanece como detalle interno de persistencia para no romper claves
  históricas; la interfaz y los casos de uso solo reconocen una fila actual por carrera.
- La fila actual es editable tanto activa como inactiva. Deshabilitarla impide nuevos
  procesos, pero no oculta ni modifica historia.
- La eliminación física solo se permite si la malla no tiene ofertas ni sílabos. Cuando
  existen dependencias, la acción correctiva es deshabilitarla.
- Crear un sílabo fija un contexto académico propio; las revisiones inmutables incluyen
  esa fotografía y no dependen de cambios posteriores en la malla.
- Plantillas, fuentes y revisiones mantienen su versionado e inmutabilidad. Esta decisión
  cambia únicamente la gestión de la malla académica.

## Cambios previstos

- Dominio: una malla actual por carrera y estados activa/inactiva/histórica internos.
- Backend: consultas y mutaciones sobre la malla actual; alta de ofertas y apertura de
  convocatorias condicionadas a que esté activa; eliminación protegida y auditada.
- Datos: indicador único de fila actual y fotografía académica en cada sílabo.
- Frontend: página singular, estado vacío universal y acciones editar,
  deshabilitar/reactivar y eliminar; sin buscador, filtros ni listado de versiones.
- Seguridad/auditoría: alcance de carrera aplicado en servidor y registro de toda
  mutación.
- Trabajos/integraciones: sin cambios.

## Pruebas

- Crear como máximo una malla actual por carrera.
- Editar la misma malla activa o inactiva y mantener su constructor.
- Deshabilitar y reactivar con alcance y auditoría.
- Eliminar sin dependencias y rechazar eliminación cuando existen ofertas o sílabos.
- Rechazar ofertas y procesos nuevos sin malla activa.
- Conservar la lectura histórica de un sílabo después de editar o deshabilitar la malla.
- Proteger el contrato frontend singular y la ausencia de buscador/filtros/versiones.

## Pasos

- [x] Registrar la decisión que reemplaza el versionado visible.
- [x] Incorporar la restricción de una malla actual y la fotografía académica.
- [x] Adaptar casos de uso, autorización y auditoría.
- [x] Simplificar rutas y pantalla a una sola Malla.
- [x] Implementar edición, estado y eliminación protegida.
- [x] Bloquear procesos nuevos sin malla activa y preservar la historia.
- [x] Actualizar trazabilidad, pruebas y evidencia focalizada.

## Riesgos y reversión

- Las filas anteriores no se borran: pasan a ser históricas internas, por lo que la
  reversión puede volver a exponerlas sin reconstruir referencias.
- La fotografía académica es aditiva y evita que cambios de la malla alteren sílabos ya
  creados.
- La restricción parcial única evita dos mallas actuales incluso ante concurrencia.
- La migración inversa conserva datos y solo normaliza los estados al contrato anterior.

## Evidencia de cierre

- 64 pruebas focalizadas de estructura académica, convocatoria, revisión y contrato de
  interfaz: 1.579 aserciones correctas.
- 6 pruebas focalizadas de documentos y exportación: 158 aserciones correctas.
- TypeScript, ESLint focalizado, Prettier y formato PHP: correctos.
- No se ejecutaron build ni `composer verify`: la validación fue proporcional al cambio
  y queda pendiente la revisión manual de Malla en claro, oscuro, teclado y móvil.
