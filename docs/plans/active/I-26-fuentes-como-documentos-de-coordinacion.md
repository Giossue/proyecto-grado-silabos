# I-26 — Fuentes académicas como documentos de coordinación

## Decisión de producto

Las fuentes académicas dejan de ser expedientes versionados del Administrador y pasan a
ser documentos de trabajo de la Coordinación, que es quien realmente entrega estos
materiales a los docentes. Decisión confirmada por los autores el 1 de septiembre
de 2026:

- Una fuente no tiene versiones, fragmentos ni conflictos: es un solo documento vivo.
- Sus datos son nombre, descripción, notas internas y un contenido en Markdown.
- La edita únicamente la Coordinación de la carrera; Administración no participa.
- El contenido se redacta en un editor Markdown con cinta de opciones y vista previa,
  al estilo de un procesador de textos.
- Las convocatorias fijan fuentes (no versiones) y la evidencia de IA cita la fuente y
  un extracto con huella del contenido en el momento del análisis.

La inmutabilidad de plantillas publicadas y de revisiones enviadas/aprobadas no cambia.
La evidencia de IA sigue siendo una fotografía inmutable: conserva nombre, extracto y
huella aunque la fuente se edite después.

## Trazabilidad

- RF-027..033 (fuentes), CU-05, COR-11; RN-013..016 se reformulan (sin versiones ni
  contradicciones automáticas).
- Módulos afectados: Configuration (fuentes), Syllabus (convocatorias), AiAssistance
  (evidencia), Identity (permisos por rol).

## Plan

- [ ] Migración: `fuentes_academicas` gana `notas_internas` y `contenido`; pierde
  `tipo`, `autoridad` y `responsable`. `fuentes_convocatoria` referencia la fuente.
  `evidencias_ia` cita fuente + extracto + huella de contenido. Se eliminan
  `versiones_fuente`, `fragmentos_fuente` y `conflictos_fuente` con sus triggers.
- [ ] Backend: gates solo Coordinación; acciones crear/editar metadatos/editar
  contenido; retirar activar/clonar/fragmentos/conflictos; convocatorias fijan
  fuentes activas; colector de evidencia lee `contenido`.
- [ ] Frontend: listado sin versiones; formulario con nombre, descripción y notas
  internas; detalle con editor Markdown (cinta de opciones + vista previa) y edición
  de metadatos; convocatorias seleccionan fuentes.
- [ ] Pruebas: reescritura de las pruebas de fuentes y ajuste de convocatorias, IA,
  revisión y relevo docente.
- [ ] Documentación: especificación de plantillas y fuentes, modelo de dominio, roles,
  pantallas, base de datos, decisiones y AGENTS.md.
- [ ] Verificación: `composer verify`.

## Migración segura

El contenido existente no se pierde: la migración compone el `contenido` Markdown de
cada fuente a partir de los fragmentos de su versión más reciente (título como
encabezado, texto tal cual y datos estructurados como bloque JSON). Las convocatorias
existentes conservan sus fuentes (la fijación pasa de versión a fuente). La evidencia
de IA histórica conserva nombre, extracto y huella; pierde solo las columnas de
versión/fragmento que dejan de existir. No hay reverso: recuperar el versionado sería
reconstruir el módulo anterior.
