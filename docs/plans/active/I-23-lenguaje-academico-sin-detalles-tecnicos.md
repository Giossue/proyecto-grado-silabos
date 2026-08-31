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

- [x] Auditar las vistas y mensajes visibles de plantillas, fuentes, revisiones y documentos.
- [x] Sustituir el contenido técnico por lenguaje académico o retirarlo cuando no aporte a la tarea.
- [x] Evitar que los contratos de interfaz entreguen huellas que la pantalla no necesita.
- [x] Añadir una prueba de arquitectura para impedir regresiones de estas etiquetas.
- [x] Ejecutar verificaciones de tipos, estilo, pruebas puntuales y compilación.

## Resultado

- Las pantallas muestran etiquetas académicas en español y dejan de presentar
  huellas, tipos de almacenamiento, claves de respaldo, versiones de reglas o
  referencias de decisiones internas.
- Las huellas continúan almacenándose para trazabilidad, pero los controladores
  de las pantallas afectadas ya no las envían al navegador.

## Decisiones y supuestos

- La conservación de versiones publicadas, fuentes activas y revisiones se mantiene
  como invariante de dominio; solo deja de describirse mediante términos técnicos en la UI.
- Los códigos de configuración se conservan para el sistema, pero no se usarán como
  texto de respaldo en pantallas de consulta.
