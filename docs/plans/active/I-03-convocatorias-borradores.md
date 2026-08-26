# I-03: Convocatorias y elaboración de borradores

## Estado

Implementado y verificado automáticamente. El cierre depende de la revisión manual de
interfaz y de `PV-05`, `PV-06` y `PV-08`; ver `docs/plans/pending-work.md`.
`composer verify` en verde el 2026-08-21: 163 pruebas y 1887 aserciones.

## Trazabilidad

- RF-034 a RF-044; RN-017 a RN-024; CU-06 y CU-07.
- DOC-01 a DOC-05; COR-01 a COR-04.
- PV-05, PV-06, PV-08 y DT-06.

## Resultado demostrable

El coordinador de una carrera configura y abre una convocatoria con periodo, plantilla
publicada, fuentes activas, fechas y una política explícita de agrupación. La apertura
genera exactamente los expedientes esperados desde ofertas y asignaciones vigentes. El
docente asignado inicia, edita y valida el borrador por secciones, con datos maestros de
solo lectura, autoguardado observable y conflicto de concurrencia sin sobrescritura.

## Decisiones y supuestos

- PV-05 impide afirmar volúmenes institucionales. Las colecciones se paginan y las
  pruebas usan datos representativos, sin fijar capacidad real.
- PV-06 impide imponer una agrupación institucional. Cada convocatoria exige escoger entre
  `por_oferta` (un expediente agrupa sus paralelos) y `por_paralelo`; la elección queda
  auditada y el esquema conserva las relaciones explícitas para poder migrar.
- PV-08 impide inventar fórmulas de horas, créditos o ponderaciones. Los campos de tipo
  cálculo no son editables ni evaluados; la validación informa que requieren una regla
  oficial si llegaran a una plantilla publicada.
- DT-06 usa temporalmente `lock_version` sobre el borrador completo. El servidor exige
  la versión esperada e informa conflicto HTTP 409; no aplica last-write-wins.
- PV-16 permanece cerrado por defecto: coordinación puede seguir la convocatoria, pero no
  editar contenido docente.

## CU-06 — Abrir convocatoria de sílabos

- Actor y rol: Coordinador activo en la carrera seleccionada.
- Disparador: confirma la apertura de una convocatoria preparada.
- Precondiciones: carrera/periodo vigentes, plantilla publicada compatible, fuentes
  seleccionadas activas y sin conflicto abierto, ofertas/paralelos/asignaciones docentes
  vigentes y política de agrupación explícita.
- Flujo: crea convocatoria en preparación, configura fuentes y fechas, previsualiza el total,
  abre dentro de una transacción y genera expedientes, vínculos y colaboradores.
- Errores: alcance ajeno, configuración incompleta, fuente inválida, oferta sin paralelo
  o paralelo sin docente; no se generan expedientes parciales.
- Efecto: convocatoria abierta, expedientes en `not_started`, plantilla/fuentes fijadas y
  auditoría con conteos y política seleccionada.
- Efectos posteriores: ninguno en I-03; notificaciones se conectan en I-05.

## CU-07 — Elaborar sílabo

- Actor y rol: Docente activo y colaborador vigente del expediente.
- Disparador: abre el expediente asignado o cambia un campo editable.
- Precondiciones: convocatoria abierta y estado `not_started` o `draft`.
- Flujo: inicia borrador, visualiza maestros, edita por sección, autoguarda con
  `lock_version`, administra filas con ID estable y ejecuta validación determinística.
- Errores: campo heredado/no editable, contenido inválido, asignación ajena o vencida,
  versión concurrente distinta y estado bloqueado.
- Efecto: valores de trabajo actualizados, versión incrementada, completitud recalculada
  y ejecución de validación reproducible; nunca se modifica plantilla ni fuente.
- Auditoría: inicio, actualización y validación, sin registrar contenido académico.

## Cambios previstos

- Datos: convocatorias, fuentes fijadas, fechas, expedientes, ofertas/paralelos relacionados,
  colaboradores, valores/filas y resultados de validación.
- Backend: políticas por registro y acciones transaccionales de apertura, guardado y
  validación.
- Frontend: panel/listado/seguimiento de coordinación y panel/listado/resumen/editor/
  validación docente.
- Pruebas: alcance horizontal, generación atómica, agrupación explícita, herencia,
  autorización, concurrencia y validación.
- Documentación: trazabilidad y evidencia de comandos.

## Pasos

- [x] Crear esquema y modelos de convocatoria/borrador/validación.
- [x] Implementar configuración, previsualización y apertura atómica de convocatoria.
- [x] Implementar políticas y consultas de seguimiento por alcance.
- [x] Implementar inicio, edición/autoguardado y filas estables del borrador.
- [x] Implementar validación determinística y completitud.
- [x] Construir COR-01..04 y DOC-01..05 con estados accesibles.
- [x] Alinear el alta de COR-02 con el panel lateral derecho compartido.
- [x] Añadir pruebas PostgreSQL y actualizar trazabilidad.
- [x] Ejecutar `composer verify`.
- [ ] Completar comprobación manual con teclado, lector de pantalla, móvil y ambos temas.

## Riesgos y reversión

- La elección por convocatoria no define el criterio institucional de PV-06; una decisión
  posterior puede fijar el valor permitido sin perder relaciones históricas.
- No se evalúa expresión arbitraria ni se acepta HTML; los cálculos esperan PV-08.
- Abrir es transaccional e irreversible desde la interfaz en I-03; una corrección de
  configuración se realiza mediante otra convocatoria y preserva auditoría.
- Los conflictos de edición devuelven el estado vigente para recarga y comparación; no
  se fusionan silenciosamente.

## Evidencia de cierre

- `CampaignAndDraftTest`: 11 pruebas y 95 aserciones focalizadas sobre PostgreSQL.
- La apertura es atómica, bloquea contradicciones pendientes y un reintento no duplica
  expedientes.
- El autoguardado serializa escrituras, aplica tipos de plantilla y devuelve conflicto
  HTTP 409 sin sobrescribir; las filas repetibles conservan identidad estable.
- Coordinación no edita contenido mientras PV-16 siga abierta y la validación
  determinística se identifica como `baseline-v1`, separada de IA.
- COR-02 prioriza el listado y abre la preparación de convocatoria desde su acción principal
  en un panel lateral derecho.
- `composer verify`: 140 pruebas, 1374 aserciones, Pint, PHPStan nivel 7, ESLint,
  Prettier, TypeScript y build aprobados.
- PV-05/PV-06/PV-08 y la validación manual permanecen abiertos; no se presentan como
  aceptación institucional.
