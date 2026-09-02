# Inventario de interfaces

## Globales

| ID    | Pantalla                   |
| ----- | -------------------------- |
| UI-01 | Acceso                     |
| UI-02 | Selección de carrera y rol |
| UI-03 | Notificaciones             |
| UI-04 | Perfil y sesiones          |

## Docente

| ID     | Pantalla                        |
| ------ | ------------------------------- |
| DOC-01 | Panel docente                   |
| DOC-02 | Mis sílabos                     |
| DOC-03 | Resumen del sílabo              |
| DOC-04 | Editor por secciones            |
| DOC-05 | Validación determinística       |
| DOC-06 | Asistencia de IA                |
| DOC-07 | Confirmación de envío           |
| DOC-08 | Correcciones y respuestas       |
| DOC-09 | Historial y comparación         |
| DOC-10 | Sílabo aprobado y exportaciones |

## Coordinador

| ID     | Pantalla                                                         |
| ------ | ---------------------------------------------------------------- |
| COR-01 | Panel de coordinación                                            |
| COR-02 | Convocatorias                                                    |
| COR-03 | Asistente de convocatoria                                        |
| COR-04 | Seguimiento de convocatoria                                      |
| COR-05 | Cola de revisión                                                 |
| COR-06 | Espacio de revisión                                              |
| COR-07 | Comparar revisiones                                              |
| COR-08 | Solicitar corrección                                             |
| COR-09 | Aprobar                                                          |
| COR-10 | Reabrir aprobado                                                 |
| COR-11 | Fuentes académicas                                               |
| COR-12 | Informes                                                         |
| COR-13 | Malla, constructor visual/formulario y materias de la carrera    |
| COR-14 | Ofertas académicas y paralelos de la carrera, en rutas separadas |
| COR-15 | Asignaciones docentes de la carrera                              |

## Administrador

| ID     | Pantalla                                                   |
| ------ | ---------------------------------------------------------- |
| ADM-01 | Panel administrativo                                       |
| ADM-02 | Usuarios                                                   |
| ADM-03 | Detalle, roles y vigencia                                  |
| ADM-04 | Jerarquía de facultades/carreras y catálogos globales      |
| ADM-05 | Plantillas                                                 |
| ADM-06 | Constructor de plantilla                                   |
| ADM-07 | Previsualizar y publicar                                   |
| ADM-09 | Procesos (correos, documentos y análisis en segundo plano) |
| ADM-10 | Auditoría                                                  |
| ADM-11 | Configuración                                              |
| ADM-12 | Calendario de sílabos (proceso institucional)              |

## Patrones comunes

- El menú depende del rol activo y de las capacidades efectivas.
- UI-02 recibe a Coordinación con cards de sus carreras vigentes. La carrera activa se
  muestra bajo el nombre de usuario y puede cambiarse desde un `Sheet` en ese mismo menú.
- UI-03 se abre desde el acceso de **Notificaciones** situado junto al selector de tema en
  el encabezado autenticado común. El acceso conserva el contador de pendientes para los
  tres roles y no ocupa una entrada del menú lateral.
- Todo módulo autenticado presenta el mismo encabezado mediante `PageFrame`: icono,
  título principal único, descripción y espaciado responsive. Regreso, estado y acciones
  ocupan posiciones estables; Configuración comparte el encabezado en su layout y trata
  Perfil, Seguridad y Apariencia como subsecciones.
- Las cards y los resúmenes métricos independientes se reservan exclusivamente para la
  pantalla Dashboard de cada rol. Fuera del Dashboard no se presentan bloques de
  conteos, totales, promedios o porcentajes; un valor solo permanece cuando forma parte
  del contexto operativo de un registro, una tabla o el contenido que se está editando.
- Los dashboards priorizan tareas vencidas, bloqueos y próximos pasos; evitan métricas
  decorativas.
- Listados de volumen variable usan URL para filtros, orden y paginación.
- Toda barra de consulta ordena sus controles como búsqueda, filtros y acción de aplicar;
  en móvil se apilan sin distribuir campos en extremos inconexos.
- Toda tabla muestra el mismo pie con rango, total, página actual y navegación, incluso
  cuando el resultado ocupa una sola página.
- Toda tabla diferencia visualmente el encabezado y alterna el fondo de sus registros;
  el primer registro usa la superficie base y el segundo el tono alterno.
- Toda columna **Acciones** muestra únicamente el botón de tres puntos de
  `TableActionsMenu`, incluso cuando solo existe una opción o el registro es de solo
  lectura. Al abrirlo, el menú nombra el registro para tecnologías asistivas, agrupa las
  opciones aplicables y explica mediante una opción deshabilitada cuando no existe una
  acción disponible; nunca se muestran botones, enlaces o texto de acción directamente
  en la celda.
- En pantallas de gestión con listados, el formulario de alta no ocupa la vista inicial:
  una acción principal abre un panel lateral desde la derecha, conserva los errores en el
  panel y lo cierra únicamente después de una respuesta exitosa.
- Todo dato obligatorio muestra un asterisco rojo junto a su etiqueta y anuncia
  «obligatorio» a tecnologías asistivas. Las condiciones como «si es heredado» o «salvo
  administrador» se indican con la misma condición y no convierten campos opcionales en
  obligatorios.
- La ayuda breve que aparece al pasar el puntero o enfocar un control usa `Tooltip` de
  shadcn. Los elementos HTML no usan el atributo `title` como tooltip nativo; cuando un
  control necesita nombre accesible, lo conserva mediante texto visible o `aria-label`.
- Los formularios en panel lateral mantienen **Cancelar** y la acción principal en un pie
  fijo. Solo el contenido central se desplaza, conserva espacio inferior y pasa por debajo
  del pie sin ocultar el último campo.
- Los botones secundarios textuales (`outline` o `secondary`) no llevan iconos de acción;
  su etiqueta basta para comunicar el resultado. El indicador de carga sí permanece. Se
  exceptúan los controles exclusivamente icónicos con nombre accesible y los disparadores
  que funcionan como campos compuestos, como el selector de fecha.
- Editor y revisión usan navegación por secciones, completitud, errores, observaciones y
  estado de guardado sin saturar la pantalla.
- Acciones de versión de plantilla muestran de forma explícita qué queda inmutable. Las
  fuentes son documentos editables: COR-11 abre el contenido en un editor Markdown con
  cinta de opciones y vista previa.
- Los estados usan las mismas etiquetas y colores en todo el producto.
- Los IDs internos y detalles de infraestructura no se muestran.
- ADM-04 usa el submenú **Estructura académica** con rutas independientes para Facultades,
  Carreras, Campus, Modalidades y Periodos académicos. Carreras muestra su Facultad y
  Facultades muestra la cantidad relacionada; los catálogos no se mezclan ni se ocultan
  en pestañas.
- COR-13 usa una única entrada **Malla**. Si existe, la ruta abre directamente la página
  completa con **Desglose académico** y **Constructor visual**; si no existe, muestra el
  estado vacío universal y la acción para crearla. No presenta buscador, filtros, cards,
  paginación, publicación ni número de versión. Materias, campos y relaciones se
  consultan y mantienen dentro de esa malla. COR-14 conserva el submenú **Ofertas y
  paralelos** con una ruta por colección.
- COR-13 agrupa **Editar**, **Deshabilitar/Reactivar**, **Eliminar** y **Configurar** en un
  menú de tres puntos, con el mismo patrón de la columna de acciones de las tablas. La
  malla activa o inactiva sigue siendo editable; eliminar se rechaza cuando existen
  ofertas o sílabos y explica que debe deshabilitarse. Editar una asignación cambia
  docente, paralelo o vigencia; nunca nombre o correo de la cuenta.
- COR-13 abre la malla en una página completa con ciclos, tarjetas, totales y relaciones.
  El lienzo permite zoom, desplazamiento, conexión y reubicación, además de crear una
  materia en su ciclo y editarla directamente desde su tarjeta. El desglose académico
  ofrece las mismas operaciones mediante formularios y tablas accesibles; su alta y
  edición manual sí usan Sheet. Ciclos y campos se configuran en la malla, no en una
  plantilla global de la Carrera de Software. Al crear o editar una materia, todos los
  campos activos son obligatorios, las magnitudes se presentan en una fila compacta y
  **TOTAL** se calcula con la suma de los componentes de horas, sin incluir créditos. La
  unidad de organización curricular sugiere valores ya usados y admite escribir uno
  nuevo; el orden dentro del ciclo se asigna automáticamente cuando no lo determina el
  constructor. Una reubicación correcta se guarda sin notificación repetitiva; un fallo
  sí explica la acción correctiva.
- **Auditoría** agrupa las rutas administrativas **Procesos** (ADM-09) y **Registro de
  actividad** (ADM-10). La primera permite diagnosticar y reintentar trabajos; la segunda
  reconstruye quién hizo qué y cuándo.
- ADM-12 lista los procesos de sílabos con estado, plantilla, inicio, entrega y
  convocatorias. El alta usa el `Sheet` derecho; **Editar** solo aparece en preparación o
  en pausa; **Abrir**, **Pausar**, **Reanudar** y **Cerrar** confirman en un diálogo que
  explica la consecuencia y **Pausar** exige motivo. COR-03 elige el proceso y muestra la
  plantilla y las fechas heredadas; COR-04 pausa y reanuda la convocatoria con el mismo
  diálogo y avisa cuando el proceso institucional está en pausa o cerrado. ADM-05,
  ADM-06, COR-11 y COR-13 muestran un aviso con la razón del bloqueo y ocultan las
  acciones de edición mientras dure; el servidor rechaza igual aunque se fuerce la
  petición.
- El menú de acciones de ADM-04 distingue edición y ciclo de vida: **Editar** abre un
  `Sheet` precargado; **Archivar/Reactivar** cambia disponibilidad sin borrar historia.
- El fondo de página y las superficies de trabajo usan tokens distintos en claro y
  oscuro; tarjetas, paneles laterales y popovers conservan contraste semántico común.

### Cobertura del patrón de altas

| Rol           | Interfaces cubiertas                                       | Comportamiento                                                                                                                             |
| ------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Administrador | ADM-02, ADM-03, ADM-04, ADM-05, ADM-06 y ADM-12            | Cuentas, roles, catálogos, coordinaciones, plantillas, campos y procesos de sílabos se crean desde una acción que abre el `Sheet` derecho. |
| Coordinador   | COR-02, COR-06, COR-11, COR-13, COR-14 y COR-15            | Convocatorias, observaciones, fuentes, mallas, materias, ofertas, paralelos y asignaciones docentes usan el mismo patrón.                  |
| Docente       | DOC-02 a DOC-10                                            | No administra colecciones maestras. Edición, IA, envío y respuestas son flujos académicos de página completa, no formularios de alta.      |

Selección de rol, filtros, configuración personal, resolución de contradicciones y
acciones de ciclo de vida como publicar, activar, aprobar o reabrir permanecen en su
de esa regla porque no crean una colección desde un listado. `ManagementCreationUiTest`
protege la clasificación y falla si una alta de gestión vuelve a incrustarse en una
página.
