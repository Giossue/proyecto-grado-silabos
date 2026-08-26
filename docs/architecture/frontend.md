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
- Los paneles destacan trabajo que requiere acción; no repiten todos los conteos como cards.
- CRUD corto puede usar diálogo; editor, revisión, convocatoria y publicación usan página completa.
- La navegación visible no supera dos niveles y cambia según el rol efectivo.
- No uses pestañas para ocultar submódulos que merecen una ruta/navegación propia.
- Las superficies usan `background`, `card`, `popover` y `sidebar` como tokens separados;
  un módulo no introduce colores directos para fabricar contraste.

## Formularios y editor

- Etiqueta visible, ayuda breve, indicador de requerido y error junto al campo.
- Deshabilitar explica por qué; solo lectura no parece editable.
- Autoguardado con debounce, idempotencia y estado `guardando/guardado/error/conflicto`.
- Antes de salir con cambios no confirmados, advierte sin crear falsos positivos.
- Tablas repetibles conservan claves de fila estables; reordenamiento es accesible.
- Campos heredados muestran origen y no aceptan edición docente.

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
