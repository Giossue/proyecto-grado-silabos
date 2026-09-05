# I-49 — Editor visual de documentos para fuentes académicas

## Estado

Implementado localmente — 5 de septiembre de 2026. Queda la revisión manual de la
hoja en teclado, lector de pantalla, 360 px, zoom y ambos temas, exigida por la
Definition of Done.

## Trazabilidad

- RF-027..033, RN-013..016, CU-05, COR-11, CP-F fuente/evidencia.
- Ajusta la decisión confirmada I-26: el contenido sigue siendo Markdown seguro, pero
  la Coordinación ya no redacta ni alterna a una vista de sintaxis Markdown.

## Decisión de interfaz

- COR-11 se presenta como una hoja de documento editable con formato aplicado en tiempo
  real y cinta de opciones. No hay modo ni botón de «Vista previa».
- El cliente interpreta Markdown seguro al abrir el documento y vuelve a serializar el
  contenido editado a Markdown antes de sincronizarlo con el formulario. La API, la
  validación, la auditoría y la evidencia de IA permanecen sin cambios.
- No se usa PhpWord: no hay exportación ni generación de DOCX en este flujo.

## Cambios previstos

1. Reemplazar el área de sintaxis por un `contenteditable` visual y accesible, con
   pegado como texto plano y conversión de los elementos soportados a Markdown.
2. Mantener la cinta existente (encabezados, énfasis, listas, cita, tabla, código,
   enlace y divisor) sobre el documento visual.
3. Retirar la fecha de actualización y las referencias a vista previa de COR-11.
4. Actualizar especificación, pantallas y matriz de trazabilidad; verificar tipos,
   lint, build y la regresión de fuentes.

## Verificación ejecutada

- `npm run lint:check`, `npm run types:check`, Pint y `npm run build`: correctos.
- `TemplateAndSourceTest`: 14 pruebas y 118 aserciones correctas sobre PostgreSQL local.
- `composer verify` llega a `format:check` y se detiene exclusivamente por 11 archivos
  preexistentes fuera de este cambio; `MarkdownEditor.vue`, `Sources/Show.vue` y
  `Sources/Index.vue` están formateados y no aparecen en esa lista.
