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

`PaginatedDocument` presenta el constructor ADM-06 en carta con márgenes de 2.5 cm.
`documentPagination` mide el DOM y agrega separadores transitorios entre unidades
marcadas con `data-page-unit`; `data-page-keep-next` mantiene títulos con contenido.
Las tablas se recorren por grupos completos de `rowspan`. Se conservan los nodos Vue y
sus controles; los separadores se retiran antes de recalcular. `MutationObserver`,
`ResizeObserver` y la carga de fuentes/imágenes disparan un cálculo agrupado por frame,
sin observar sus propias inserciones. Ninguna página o posición se persiste.
Es presentación de la muestra administrativa, no un motor de impresión ni un cambio
del formulario docente. Una unidad indivisible excepcionalmente más alta que el área
útil se conserva visible; no se recorta ni se descarta contenido.

`AppSidebarLayout` y `PageFrame` recortan el exceso horizontal con `overflow-x-clip`:
no deben crear un contenedor de scroll mediante `overflow-x-hidden`, que desvincularía
las paletas `sticky` del desplazamiento de la ventana. La hoja mantiene su scroll
horizontal local; la paleta ADM-06 queda bajo el encabezado con altura máxima disponible.

En ADM-06 el arrastre conserva una copia del orden inicial y cambia la colección local
al pasar por la mitad superior/inferior de otra pieza. Solo el drop envía la mutación;
dragend sin drop revierte, y el rechazo del servidor recupera las props confirmadas.
Los campos permanecen en su sección. El alta de bloque elige el primer tipo de campo
en un `Dialog` y reutiliza `storeSection` para crearlos atómicamente. Los índices de
inserción del cliente son base cero; `position` del caso de uso se envía en base uno.

## Diseño integrado de la plantilla (I-56)

`TemplateSheetEditor` conserva bloques, arrastre, paleta y paginación. Cada
`TemplateDesignBlock` reúne Diseño y Propiedades usando las pestañas compartidas.
Mantiene montado el editor al cambiar de pestaña y controla el borrador conjunto
(nombre, ayuda, IA y documento), incluido el aviso de salida. Un solo PATCH de
`SaveTemplateDocument` verifica la huella y persiste todo en la misma transacción;
solo el bloque de flujo envía documento nulo para editar sus propiedades, nunca
su estructura. Los campos heredados y los bloques fijos no ofrecen asistencia de IA.
Se retiró `TemplateFieldSheet`; las propiedades ya no tienen un guardado separado.

`TemplateDesignBlock` ofrece `TemplateDocumentEditor` (Tiptap Vue 3, ADR-0007) en un
diálogo amplio con guardado explícito. La cinta reutiliza Button, Select, FieldGroup,
Input, Alert y Dialog compartidos; los colores libres pertenecen al documento, no al
tema de la aplicación. El documento JSON contiene solo nodos/marcas del contrato PHP
`TemplateDocument`; no se persiste HTML ni se acepta HTML arbitrario en el servidor.

La cinta agrupa Formato, Tablas y Campos mediante Tabs, sin ocultar ni desmontar
Tiptap. La sugerencia `@docente` es un comando de inserción: crea un nodo `field`
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
sumas de `TableLayout`. Los diseños sin documento mantienen el lector anterior.

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
