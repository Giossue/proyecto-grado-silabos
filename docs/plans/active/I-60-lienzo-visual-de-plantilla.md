# I-60 — Vista y modo de edición de plantilla

## Estado

Implementado y verificado localmente el 2026-09-09 por decisión explícita del
responsable del producto.

## Objetivo

Separar la lectura de la plantilla institucional de su modo de edición. La plantilla se
lee como un sílabo normal y se modifica en una ruta dedicada, sobre la misma hoja, con
una cinta contextual sin encerrar el documento en un modal.

## Decisiones

- `/admin/plantilla/{id}` es una vista limpia, siempre de solo lectura.
- `/admin/plantilla/{id}/editar` concentra todas las acciones de configuración.
- El modo de edición usa un layout propio de ancho completo, sin navegación lateral ni
  encabezado administrativo; su cabecera y cinta permanecen visibles al recorrer la hoja.
- La cinta permanece visible y cambia según se seleccione un bloque, campo o tabla.
- La tabla se edita dentro de la hoja; el editor documental deja de abrir un diálogo de
  pantalla completa.
- Se conserva el contrato existente de bloques, campos, documentos y tablas; no se
  introduce Vue Flow ni otro modelo paralelo.

## Criterios

- [x] La vista normal muestra el documento sin controles de edición.
- [x] El botón Editar abre una URL dedicada y el enlace de salida vuelve a la vista.
- [x] La hoja identifica visualmente el elemento seleccionado y la cinta presenta sus
      acciones.
- [x] El modo de edición aprovecha todo el viewport y no monta el sidebar administrativo.
- [x] Una tabla se edita directamente sobre la hoja, con formato y guardado en la cinta.
- [x] La configuración estructural se despliega bajo la cinta, sin modal.
- [x] Los bloqueos de proceso impiden entrar al modo de edición.
- [x] Pasan pruebas de servidor, tipos, lint, build y comprobación en Chromium.

## Verificación

Pasan 57 pruebas focalizadas con 1.656 aserciones, Pint, ESLint, TypeScript y el build de
Vite. Chromium comprobó la vista limpia, la URL `/editar`, el cambio de contexto, el
editor de tabla dentro de la hoja y el panel estructural sin ningún diálogo abierto.

## Corrección — editor continuo entre hojas (2026-09-09)

El paginador trataba el editor Tiptap completo como una unidad indivisible y podía
empujarlo a la hoja siguiente, dejando un área aparentemente vacía. Las unidades activas
marcadas con `data-page-flow-through` ya no reciben un separador previo: conservan su
posición y altura, actualizan el número de hojas y muestran la tabla completa mientras se
edita.

## Corrección — espacio de trabajo dedicado (2026-09-09)

La ruta de edición deja de montarse dentro de `AppSidebarLayout` y `PageFrame`. El nuevo
`TemplateEditorLayout` conserva los diálogos y avisos globales, pero entrega todo el ancho
al documento. Una cabecera sticky reúne la salida a la vista normal y la cinta contextual;
esta permanece fija, en una sola fila desplazable, mientras se recorre el sílabo.

La cinta separa las acciones del elemento a la izquierda y **Documento** a la derecha.
La selección ya se reconoce por el contorno sobre la hoja, sin repetir una etiqueta en la
cinta. Seleccionar un campo oculta las acciones de su bloque; la única modificación del
bloque se nombra **Renombrar bloque**, de acuerdo con lo que realmente permite el
formulario.

Los separadores de paginación que preceden al primer contenido visible de una sección o
campo se elevan fuera de ese contenedor. De esta forma, el contorno de selección rodea
solo el contenido real y no incluye el espacio artificial hasta la hoja siguiente.
