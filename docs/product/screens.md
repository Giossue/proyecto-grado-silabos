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
| ADM-12 | Convocatorias (proceso institucional de sílabos)           |

## Patrones comunes

- El menú depende del rol activo y de las capacidades efectivas.
- UI-02 recibe a Coordinación con cards de sus carreras vigentes. La carrera activa se
  muestra bajo el nombre de usuario y puede cambiarse desde un `Sheet` en ese mismo menú.
- El selector de tema del encabezado alterna únicamente entre claro y oscuro; no existe
  la opción «Sistema». Sin preferencia guardada, la aplicación arranca en claro.
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
- «Nueva plantilla» crea de inmediato el formato oficial completo (doce secciones,
  campos, tablas armadas y ficha de identificación) y abre su constructor; no muestra un
  `Sheet` porque no requiere datos. Administración solo ajusta sobre la hoja.
- ADM-06 se arma sobre la hoja tal como se imprimirá (I-33). Una paleta fija ofrece
  Bloque, Texto, Tabla, Lista con viñetas y Lista numerada: se arrastran a la hoja (una
  línea azul marca dónde caerán) o se pulsan para agregar al final del bloque activo. Los
  títulos se renombran con un clic; el asa reordena; el menú de tres puntos cambia el
  tipo, abre Propiedades en un `Sheet` o elimina con confirmación. Todo se guarda solo,
  con un aviso corto. Con el proceso abierto la hoja se muestra sin paleta ni asas.
  Estándar del impreso: logos institucionales, título azul centrado, Arial 11 pt, bloques
  numerados «1.» y campos «1.1» en negrita, márgenes de 2.5 cm, tablas con cabecera azul y
  filas alternas celestes. El formato lo pone la plantilla; el docente solo llena
  contenido.
- La ficha de identificación institucional (bloque «Asignatura», heredado) se pinta fija
  con datos de la malla, la oferta, los paralelos (incluida su jornada) y los docentes;
  no se diseña ni se llena (I-34). Mapa de datos: `docs/product/identificacion-institucional.md`.
  COR-14 (paralelos) muestra y edita la jornada.
- Indicadores del Panel (UI-01), cuatro por rol y todos accionables: Administración ve
  avance del proceso (% aprobados), días para la entrega, carreras sin convocar y sílabos
  sin iniciar; Coordinación, avance, días, por revisar y sin iniciar; Docencia, sílabos
  por entregar, días, avance de sus borradores y por corregir. Sin conteos de catálogo.
- El Panel de cada rol abre con «Puesta en marcha»: barra de progreso y los pasos en
  orden (Administración: facultades, carreras, campus, modalidades, periodo, cuentas,
  coordinadores, plantilla, proceso; Coordinación: malla, ofertas, paralelos, docentes,
  fuentes, convocatoria; Docencia: recibir, iniciar, enviar). Cada paso se calcula con
  datos reales; el siguiente lleva su botón y la tarjeta desaparece al completarse. El
  encabezado repite el avance en miniatura (barra con color y «n/m», tooltip
  «Configuración del sistema») y lleva al Panel; se recalcula en cada petición, así
  que reaparece si algo se borra.
- Encabezado del sílabo: logo de la universidad (uno, lo reemplaza Administración desde
  «Logo de la universidad» en la plantilla) y logo de la facultad de la carrera
  (obligatorio al crear la facultad en ADM-04; se reemplaza al editarla). Ambos PNG sin
  fondo; el sistema los ajusta a la medida fija (universidad 850 × 315 px, facultad
  600 × 180 px) conservando la proporción y centrando sobre transparente.
- Si una sección tiene un solo campo, no lleva subtítulo «n.1»: basta el título de la
  sección, en la hoja, el editor docente, la revisión y el Word. Con varios campos sí
  se numeran.
- Las tablas se eligen, no se diseñan (I-34). Al soltar «Tabla» se escoge un formato
  institucional listo (planificación por unidades, bibliografía, escala, perfil de egreso
  o tabla simple); las cabeceras se renombran con un clic y el menú ⋯ del campo ofrece
  «Elegir otro formato». Un formato nuevo se agrega en código (`tablePresets.ts`).
DOC-01 llena una cuadrícula con una casilla por celda, unidades y totales calculados;
  COR-05 la muestra tal cual.
  Las fuentes son documentos editables: COR-11 abre el contenido en un editor Markdown con
  cinta de opciones y vista previa.
- ADM-02: una cuenta «Pendiente de activación» (contraseña temporal sin cambiar) tiene en
  su menú **Reenviar acceso** (nueva contraseña temporal al correo actual) y
  **Eliminar** (solo sin actividad; con historia, archivar). Corregir su correo reenvía
  el acceso al nuevo correo sin pedirlo (I-38).
- Salida de personas (I-39): en ADM-04 Carreras muestra la coordinación vigente y su menú
  tiene **Reemplazar coordinador** (o **Asignar coordinador** si no hay): cierra
  nombramiento y rol de quien sale, abre los de quien entra y, si se marca y no le
  queda otro rol, archiva la cuenta saliente. En COR-15 **Relevar docente** mueve todos
  los paralelos y sílabos de un docente al entrante con el mismo sustento documental
  (borrador se descarta, aprobado se reabre, en revisión bloquea). Archivar una cuenta
  (ADM-02) se rechaza si tiene sílabos en curso o es la única administración; al
  archivar se cierran sus asignaciones docentes vigentes.
- Los estados usan las mismas etiquetas y colores en todo el producto.
- Los IDs internos y detalles de infraestructura no se muestran.
- ADM-04 usa el submenú **Estructura académica** con rutas independientes para Facultades,
  Carreras, Campus y Periodos académicos. Carreras muestra su Facultad, su Modalidad y
  su Campus, Facultades muestra la cantidad relacionada; los catálogos no se mezclan ni
  se ocultan en pestañas.
- La modalidad se fija por carrera (obligatoria al crearla; la aprueba el CES) y no por
  oferta. No hay catálogo: son las del reglamento (presencial, semipresencial, en línea,
  a distancia). Cualquier materia puede apartarse en COR-13 («Igual que la carrera» o
  una distinta); si alguna se aparta, la carrera aparece como «Híbrida» sola (I-37).
  COR-14 abre ofertas sin selector de modalidad: la hereda de la materia o de la carrera
  y la muestra en el listado (I-35).
- COR-14 no crea ofertas una a una: **Preparar periodo** (I-36) deja toda la malla activa
  con oferta y paralelo «A» para el periodo elegido; campus y modalidad vienen de la
  carrera (ADM-04 pide ambos al crearla). Repetirlo no duplica; lo que no se dicte se
  archiva. Luego solo quedan los paralelos extra y la asignación docente.
- COR-13 usa una única entrada **Malla**. Si existe, la ruta abre directamente la página
  completa con **Interactivo** (pestaña principal, decisión de los coordinadores) y
  **Desglose académico** (`?modo=desglose`); si no existe, muestra el
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
  edición manual sí usan Sheet. «Configurar malla» solo edita código y cantidad de
  ciclos; los campos de la tarjeta (ACD, APE, AA, CRED, TOTAL) los fija el reglamento y
  nacen con la malla. Al crear o editar una materia, todos los
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
  plantilla y las fechas heredadas. COR-02 concentra en el menú de tres puntos de cada
  fila todas las acciones —ver seguimiento, editar (solo en preparación o en pausa),
  abrir, pausar y reanudar— con el mismo diálogo de
  confirmación que ADM-12; COR-04 es solo seguimiento y avisa cuando la convocatoria o
  el proceso institucional están en pausa o cerrados. ADM-05,
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
| Administrador | ADM-02, ADM-03, ADM-04, ADM-05, ADM-06 y ADM-12            | Cuentas, roles, catálogos, coordinaciones, campos y procesos de sílabos se crean desde una acción que abre el `Sheet` derecho. La única plantilla institucional se crea de inmediato porque no pide datos. |
| Coordinador   | COR-02, COR-06, COR-11, COR-13, COR-14 y COR-15            | Convocatorias, observaciones, fuentes, mallas, materias, ofertas, paralelos y asignaciones docentes usan el mismo patrón.                  |
| Docente       | DOC-02 a DOC-10                                            | No administra colecciones maestras. Edición, IA, envío y respuestas son flujos académicos de página completa, no formularios de alta.      |

Selección de rol, filtros, configuración personal, resolución de contradicciones y
acciones de ciclo de vida como publicar, activar, aprobar o reabrir permanecen en su
de esa regla porque no crean una colección desde un listado. `ManagementCreationUiTest`
protege la clasificación y falla si una alta de gestión vuelve a incrustarse en una
página.
