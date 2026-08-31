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
| COR-13 | Mallas, constructor visual/formulario y materias de la carrera   |
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
- Las cards de métricas se reservan exclusivamente para la pantalla Dashboard de cada
  rol. Fuera del Dashboard, los conteos y porcentajes necesarios se presentan como texto,
  definición, tabla o barra de estado compacta; no se envuelven en `Card` ni `StatTile`.
- Los dashboards priorizan tareas vencidas, bloqueos y próximos pasos; evitan métricas
  decorativas.
- Listados de volumen variable usan URL para filtros, orden y paginación.
- Toda barra de consulta ordena sus controles como búsqueda, filtros y acción de aplicar;
  en móvil se apilan sin distribuir campos en extremos inconexos.
- Toda tabla muestra el mismo pie con rango, total, página actual y navegación, incluso
  cuando el resultado ocupa una sola página.
- Toda tabla diferencia visualmente el encabezado y alterna el fondo de sus registros;
  el primer registro usa la superficie base y el segundo el tono alterno.
- Las celdas **Acciones** muestran un único botón de tres puntos. El menú nombra el
  registro para tecnologías asistivas, agrupa todas las opciones aplicables y explica
  mediante una opción deshabilitada cuando no existe una acción disponible.
- En pantallas de gestión con listados, el formulario de alta no ocupa la vista inicial:
  una acción principal abre un panel lateral desde la derecha, conserva los errores en el
  panel y lo cierra únicamente después de una respuesta exitosa.
- Todo dato obligatorio muestra un asterisco rojo junto a su etiqueta y anuncia
  «obligatorio» a tecnologías asistivas. Las condiciones como «si es heredado» o «salvo
  administrador» se indican con la misma condición y no convierten campos opcionales en
  obligatorios.
- Los formularios en panel lateral mantienen **Cancelar** y la acción principal en un pie
  fijo. Solo el contenido central se desplaza, conserva espacio inferior y pasa por debajo
  del pie sin ocultar el último campo.
- Editor y revisión usan navegación por secciones, completitud, errores, observaciones y
  estado de guardado sin saturar la pantalla.
- Acciones de versión muestran de forma explícita qué queda inmutable.
- Los estados usan las mismas etiquetas y colores en todo el producto.
- Los IDs internos y detalles de infraestructura no se muestran.
- ADM-04 usa el submenú **Estructura académica** con rutas independientes para Facultades,
  Carreras, Campus, Modalidades y Periodos académicos. Carreras muestra su Facultad y
  Facultades muestra la cantidad relacionada; los catálogos no se mezclan ni se ocultan
  en pestañas.
- COR-13 usa una única entrada **Mallas**. Su colección se presenta como cards y cada
  card abre una página completa con **Desglose académico** y **Constructor visual**;
  materias, campos y relaciones se consultan y mantienen dentro de esa malla. COR-14
  conserva el submenú **Ofertas y paralelos** con una ruta por colección.
- COR-13..15 ofrecen **Editar** para los registros de la carrera del rol activo. Mallas
  publicadas, sus materias y relaciones ya usadas por un sílabo muestran su bloqueo de
  historial en lugar de reescribirse. Editar una asignación cambia docente, paralelo o
  vigencia; nunca nombre o correo de la cuenta.
- COR-13 abre cada malla en una página completa con ciclos, tarjetas, totales y relaciones.
  El lienzo permite zoom, desplazamiento, conexión y reubicación, además de crear una
  materia en su ciclo y editarla directamente desde su tarjeta. El desglose académico
  ofrece las mismas operaciones mediante formularios y tablas accesibles; su alta y
  edición manual sí usan Sheet. Ciclos y campos se configuran por versión, no por una
  plantilla global de la Carrera de Software. Una reubicación correcta se guarda sin
  notificación repetitiva; un fallo sí explica la acción correctiva.
- **Auditoría** agrupa las rutas administrativas **Procesos** (ADM-09) y **Registro de
  actividad** (ADM-10). La primera permite diagnosticar y reintentar trabajos; la segunda
  reconstruye quién hizo qué y cuándo.
- El menú de acciones de ADM-04 distingue edición y ciclo de vida: **Editar** abre un
  `Sheet` precargado; **Archivar/Reactivar** cambia disponibilidad sin borrar historia.
- El fondo de página y las superficies de trabajo usan tokens distintos en claro y
  oscuro; tarjetas, paneles laterales y popovers conservan contraste semántico común.

### Cobertura del patrón de altas

| Rol           | Interfaces cubiertas                                       | Comportamiento                                                                                                                             |
| ------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Administrador | ADM-02, ADM-03, ADM-04, ADM-05, ADM-06 y COR-11 compartida | Cuentas, roles, catálogos, coordinaciones, plantillas, campos, fuentes y fragmentos se crean desde una acción que abre el `Sheet` derecho. |
| Coordinador   | COR-02, COR-06, COR-11, COR-13, COR-14 y COR-15            | Convocatorias, observaciones, fuentes, fragmentos, mallas, materias, ofertas, paralelos y asignaciones docentes usan el mismo patrón.      |
| Docente       | DOC-02 a DOC-10                                            | No administra colecciones maestras. Edición, IA, envío y respuestas son flujos académicos de página completa, no formularios de alta.      |

Selección de rol, filtros, configuración personal, resolución de contradicciones y
acciones de ciclo de vida como publicar, activar, aprobar o reabrir permanecen en su
de esa regla porque no crean una colección desde un listado. `ManagementCreationUiTest`
protege la clasificación y falla si una alta de gestión vuelve a incrustarse en una
página.
