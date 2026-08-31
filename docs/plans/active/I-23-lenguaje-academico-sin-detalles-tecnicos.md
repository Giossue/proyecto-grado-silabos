# I-23 — Lenguaje académico sin detalles técnicos visibles

## Alcance

- Eliminar de las pantallas los identificadores internos, tipos de almacenamiento,
  huellas criptográficas y mensajes técnicos de inmutabilidad.
- Mantener las reglas de publicación, trazabilidad y conservación de evidencia en el
  dominio, sin exponer su implementación a docentes, coordinadores ni administradores.
- Normalizar las etiquetas configurables restantes a español claro.

## Trazabilidad

- RF: ADM-05, ADM-06, ADM-07, COR-06, DOC-10.
- RNF: RNF-001, RNF-010, RNF-022, RNF-025, RNF-036.
- UI: I-18, I-21.

## Plan

- [ ] Auditar las vistas y mensajes visibles de plantillas, fuentes, revisiones y documentos.
- [ ] Sustituir el contenido técnico por lenguaje académico o retirarlo cuando no aporte a la tarea.
- [ ] Evitar que los contratos de interfaz entreguen huellas que la pantalla no necesita.
- [ ] Añadir una prueba de arquitectura para impedir regresiones de estas etiquetas.
- [ ] Ejecutar verificaciones de tipos, estilo, pruebas puntuales y compilación.

## Decisiones y supuestos

- La conservación de versiones publicadas, fuentes activas y revisiones se mantiene
  como invariante de dominio; solo deja de describirse mediante términos técnicos en la UI.
- Los códigos de configuración se conservan para el sistema, pero no se usarán como
  texto de respaldo en pantallas de consulta.
