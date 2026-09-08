# Frontend Inertia, Vue y shadcn-vue

## Organización

```text
resources/js/
├── components/
│   ├── ui/          primitivas shadcn-vue
│   └── domain/      estado, revisión, observación, evidencia, etc.
├── composables/     comportamiento compartido y pequeño
├── layouts/         autenticación, aplicación y rol
├── lib/             formato, rutas y utilidades puras
├── pages/
│   ├── Admin/
│   ├── Coordinator/
│   └── Teacher/
└── types/           props y contratos de presentación
```

Las páginas orquestan; los componentes de dominio representan patrones reutilizables;
las primitivas no conocen reglas académicas.

## Inertia

- Usa navegación y formularios Inertia; evita crear una API paralela sin necesidad.
- La validación final vive en Laravel y vuelve como errores de formulario.
- Usa claves de formulario/error independientes cuando haya varios formularios.
- Conserva estado local solo cuando mejora la tarea; el borrador confirmado en servidor
  es la fuente de recuperación.
- No recuerdes secretos o datos sensibles en historial del navegador.
- Usa props diferidas/parciales para datos costosos, sin ocultar estados de carga.
- Mantén rutas tipadas con Wayfinder mientras forme parte del starter.

## Sistema de componentes

Reutiliza shadcn-vue con tokens semánticos. Componentes de dominio previstos:

- `PageFrame`
- `SyllabusStatusBadge`
- `SaveStateIndicator`
- `CompletionNavigator`
- `ValidationIssueList`
- `AiRecommendation`
- `EvidenceReference`
- `ObservationThread`
- `RevisionDiff`
- `DeadlineIndicator`
- `AuthorizedDownload`
- `AsyncJobStatus`
- `CurriculumCanvas` y su alternativa `CurriculumFormView`

No crees una variante visual por módulo si el significado es el mismo.

## Pantallas operativas

- `PageFrame` es el marco de todo módulo autenticado: controla padding, separación,
  ancho opcional y un encabezado con icono, `h1`, descripción, metadatos y acciones. Las
  páginas no recrean ese bloque ni agregan otro `h1`.
- Una colección extensa empieza por tabla, búsqueda, filtros y acción principal.
- `FilterToolbar` fija el orden búsqueda → filtros → aplicar y evita distribuciones
  distintas por módulo. Los filtros URL siguen siendo responsabilidad de cada caso de uso.
- `TablePagination` es el único pie de tabla: consume metadatos de Laravel para listados
  de volumen variable y el composable local para colecciones ya cargadas y acotadas.
- `TableActionsMenu` reduce cada celda operativa a un botón de tres puntos con nombre
  accesible; sus enlaces y mutaciones permanecen dentro de `DropdownMenuGroup` y no
  cambian la autorización que decide el servidor.
- La primitiva `Table` diferencia los encabezados y alterna el fondo de filas impares y
  pares mediante tokens semánticos comunes para tema claro y oscuro.
- Los paneles destacan trabajo que requiere acción; no repiten todos los conteos como cards.
- CRUD corto puede usar diálogo; editor, revisión, convocatoria y publicación usan página completa.
- La navegación visible no supera dos niveles y cambia según el rol efectivo.
- Coordinación entra mediante cards de carrera y el menú de usuario abre
  `WorkScopeSwitcherSheet` para sustituir el único ámbito activo. Ambos envían el mismo
  formulario Inertia auditado; la interfaz no mezcla datos de varias carreras.
- No uses pestañas para ocultar submódulos que merecen una ruta/navegación propia.
- El detalle de malla sí usa pestañas para alternar dos modos de operar el mismo recurso:
  desglose académico con formularios/tablas y constructor Vue Flow sobre un contrato
  común. Materias no mantiene una pantalla paralela.
- Las superficies usan `background`, `card`, `popover` y `sidebar` como tokens separados;
  un módulo no introduce colores directos para fabricar contraste.
- En ADM-06, `TemplateSectionActions` y `TemplateFieldActions` encapsulan los menús y
  diálogos de las mutaciones estructurales. `TemplateVisualBuilder` solo decide su
  posición contextual sobre la hoja; los componentes envían las rutas Wayfinder ya
  autorizadas y delegan la confirmación de reinicio en `PurgeConfirmationDialog`.

## Formularios y editor

- `Label`, `FieldLabel` y `FieldLegend` reciben `required` y generan el asterisco con
  `text-destructive`, además del texto oculto «obligatorio»; ningún módulo recrea el
  indicador manualmente.
- La etiqueta visible y el control (`required` o `aria-required`) reflejan las reglas del
  `FormRequest`. Laravel conserva la validación final, incluidas `required_if`,
  `required_unless` y `required_without`.
- `FormSheet` reserva el área desplazable y `FormSheetActions` conserva las acciones
  dentro del formulario en un `SheetFooter` fijo, con superficie `card` y margen para el
  área segura del dispositivo.
- Deshabilitar explica por qué; solo lectura no parece editable.
- Autoguardado con debounce, idempotencia y estado `guardando/guardado/error/conflicto`.
- Antes de salir con cambios no confirmados, advierte sin crear falsos positivos.
- Tablas repetibles conservan claves de fila estables; reordenamiento es accesible.
- Campos heredados muestran origen y no aceptan edición docente.

`PaginatedDocument` presenta el constructor ADM-06 en papel carta. Recibe orientación,
margen, fuente, tamaño y color; intercambia ancho/alto en horizontal y entrega las
métricas vigentes a `documentPagination` sin persistir saltos.
`documentPagination` mide el DOM y agrega separadores transitorios entre unidades
marcadas con `data-page-unit`; `data-page-keep-next` mantiene títulos con contenido.
Las tablas se recorren por grupos completos de `rowspan`. Se conservan los nodos Vue y
sus controles; los separadores se retiran antes de recalcular. `MutationObserver`,
`ResizeObserver` y la carga de fuentes/imágenes disparan un cálculo agrupado por frame,
sin observar sus propias inserciones. Ninguna página o posición se persiste.
Es presentación de la muestra administrativa, no un motor de impresión ni un cambio
del formulario docente. Una unidad indivisible excepcionalmente más alta que el área
útil se conserva visible; no se recorta ni se descarta contenido.

`AppSidebarLayout` y `PageFrame` recortan el exceso horizontal con `overflow-x-clip`;
la hoja mantiene su propio desplazamiento horizontal en pantallas estrechas.

## Constructor progresivo de plantilla (I-56, vigente)

`TemplateVisualBuilder` proyecta las secciones persistidas como bloques de producto y
los `TemplateBlock` internos como campos. Esa traducción permite conservar el esquema
existente sin una migración destructiva: para Administración, un bloque es siempre un
contenedor y cada campo elige su presentación. El índice de `Show.vue` observa los
encabezados anclados de `TemplateVisualBuilder`, marca el bloque visible y permite saltar
tanto a ese bloque como a sus campos; en móvil lo sustituye un `Select`. El único menú de
tres puntos por bloque abre los
diálogos de `TemplateBlockCreator` y `TemplateFieldCreator`, además de las acciones
estructurales. `SaveTemplateSection` crea sección, bloques técnicos y definiciones dentro
de una sola transacción. Los identificadores técnicos se generan en cliente, se validan
como opacos y nunca se muestran.

`TemplateAppearanceSheet` trabaja con un catálogo entregado por
`TemplateAppearance`: fuentes, tamaños, colores, márgenes, orientación, alineaciones,
negrita y cursiva admitidos. La previsualización es local y el PATCH guarda únicamente
valores normalizados en `plantillas_silabo.mapeo_documento.appearance`. Un snapshot de
revisión ya copia ese mapa; `SyllabusWordDocument` interpreta los mismos valores para
DOCX. No se persisten CSS, clases ni colores libres. `ProcessLocks` y `InProgressWork`
siguen protegiendo tanto estructura como apariencia.

Los componentes documentales anteriores permanecen como lectores compatibles para
diseños ya guardados. ADM-06 no monta un editor documental global, menú contextual,
paleta ni arrastre. Cuando Administración pulsa **Editar tabla**,
`TemplateTableDesigner` abre un `Dialog` amplio con `TemplateTableEditor`, una instancia
Tiptap acotada que selecciona celdas y expone fondo, color de texto, alineación,
negrita, cursiva, borde, combinación y operaciones de filas/columnas. El guardado usa el
PATCH existente de `SaveTemplateDocument`, con su huella, autorización, bloqueo y
confirmación de reinicio. `TemplateDocument` normaliza el catálogo de atributos por
celda y `TemplateDocumentView`/`TemplateDocumentWord` lo interpretan sin persistir HTML.
El tema global se aplica solo a `tableHeader`, filas de unidad y la primera fila antigua
sin rol; un estilo explícito de celda tiene precedencia.

`TemplateToolbarSelect` y `TemplateToolbarButton` componen los controles icónicos de
estilo con ayuda de `Tooltip`, sin sustituir sus nombres accesibles y manteniendo la ayuda
de acciones deshabilitadas. El menú único conserva los nombres accesibles y concentra sus
submenús para que la hoja no reciba controles duplicados.

`TemplateBlockCreator` y `TemplateFieldCreator` reutilizan el `Select` de shadcn-vue para
el tipo de contenido dentro de sus diálogos. `SelectContent` admite `portalDisabled` para
mantener el foco dentro de ese flujo; el valor predeterminado conserva el portal en todos
los demás usos. Las tablas nuevas siguen naciendo con `TableLayout::default()` y después
pueden ajustarse en la hoja.

## Editor documental anterior (I-56, reemplazado)

`TemplateSheetEditor` conserva bloques, arrastre, paleta y paginación, pero los activa
solo después de «Editar documento». Es el dueño del modo global, el estado agregado de
cambios y el guardado secuencial de los bloques modificados. Cada
`TemplateDesignBlock` sustituye entonces su vista por un Tiptap compacto dentro de la
misma hoja; no abre un diálogo ni muestra acciones propias. Propiedades vive en un
`Sheet` lateral. Cada bloque controla un borrador conjunto (nombre, ayuda, IA y
documento), incluido el aviso de salida. Un PATCH de
`SaveTemplateDocument` verifica la huella y persiste todo en la misma transacción;
solo el bloque de flujo envía documento nulo para editar sus propiedades, nunca
su estructura. Los campos heredados y los bloques fijos no ofrecen asistencia de IA.
Se retiró `TemplateFieldSheet`; las propiedades ya no tienen un guardado separado.

`TemplateDocumentEditor` (Tiptap Vue 3, ADR-0007) mantiene el lienzo completo y usa el
`ContextMenu` compartido. Conserva la selección antes del clic derecho y ofrece un menú
distinto para texto, tabla o campo, con submenús de formato, inserción y eliminación.
Mientras está activo se declara como una sola unidad de paginación: el paginador puede
ubicarla, pero nunca inserta filas espaciadoras dentro del DOM que administra Tiptap.
Los cambios de clase por selección, foco o arrastre tampoco disparan paginación; el
contenido, tamaño, imágenes y atributos estructurales siguen siendo observados.
La interfaz reutiliza Button, ContextMenu, FieldGroup, Input, Alert y Sheet; los colores
libres pertenecen al documento, no al tema de la aplicación. El documento JSON contiene
solo nodos/marcas del contrato PHP `TemplateDocument`; no se persiste HTML ni se acepta
HTML arbitrario en el servidor.

El menú contextual «Insertar» agrupa tabla, variables automáticas y respuesta docente. La sugerencia
`@docente` ofrece el mismo alta desde el teclado: crea un nodo `field`
con referencia independiente, o `column` dentro de filas de datos/unidad repetibles.
No se añade al catálogo de variables automáticas ni se guarda como nodo `variable`.
NodeSelection enlaza el recuadro con su formato, y se conserva al actualizar sus
atributos. Solo una referencia nueva recibe su nombre inicial en Campos; las
definiciones guardadas se renombran en Propiedades cuando el bloque contiene más de
un campo. Con uno solo, la interfaz muestra únicamente el nombre del bloque y sincroniza
internamente la etiqueta del campo. El servidor aplica esa etiqueta
al documento y a `FieldDefinition` dentro de la misma transacción. Las referencias guardadas mantienen su tipo; `listStyle` representa
viñetas/numeración sin convertir su almacenamiento. `TemplateDocumentView` y
`TemplateDocumentResolver` interpretan líneas de texto o filas repetibles como
elementos, por lo que la lectura y la exportación comparten la presentación.

Las tablas libres no crean definiciones por celda. Si el documento solo contiene el
campo inicial, `insertTable` reutiliza ese nodo en la primera celda de contenido y
reemplaza el párrafo de arranque; el resto queda vacío. El recuadro se presenta como
«Respuesta del docente» mientras sea el único campo, y recupera su etiqueta cuando
existen dos o más. Las etiquetas se renderizan como texto, sin prefijos decorativos.

`TemplateDocumentView` proyecta ese contrato sin `v-html`: celdas con spans y anchos,
texto fijo, variables de servidor y controles docentes. Docencia conserva autoguardado,
control de versión, validación e IA por campo; no monta Tiptap ni recibe controles de
diseño. Las tablas repetibles expanden grupos de filas con claves tipadas, unidades y
sumas de `TableLayout`. I-57 añade roles semánticos estables para semana, ACD, APE y AA:
las etiquetas pueden cambiar sin romper cálculos. `PlanningSummary` deriva el total
general y compara con la fotografía académica; nunca persiste ese resultado. Agregar una
unidad crea una fila `_kind=unit`, y quitarla renumera las posteriores. Los diseños sin
documento mantienen el lector anterior.

El guardado administra su confirmación local de reinicio para conservar callbacks,
errores y borrador. `registerLocalPurgeConfirmation` evita un segundo diálogo global
para esa ruta y se desregistra al desmontar. El fingerprint incluye título, definición
de campos y configuración; otra sesión no se sobrescribe silenciosamente.

## Feedback y acciones sensibles

- Toda mutación tiene pendiente, éxito y error.
- Aprobar, publicar, reabrir y enviar explican la revisión/versión que congelan.
- Una acción reversible requiere confirmación proporcional; evita fricción gratuita.
- Un fallo de IA se presenta como indisponibilidad de ayuda, no como error del sílabo.
- Nunca mezcles un bloqueo determinístico con una recomendación opcional.

## Accesibilidad y responsive

- Objetivo WCAG 2.2 AA en pantallas principales.
- Teclado completo, foco visible/restaurado, nombres accesibles y anuncios de estado.
- Contraste suficiente en claro y oscuro; el color no es el único indicador.
- Desde 360 px sin desplazamiento horizontal global.
- En móvil, las tablas priorizan columnas/acciones o cambian a lista semántica; no reducen
  texto hasta hacerlo ilegible.
