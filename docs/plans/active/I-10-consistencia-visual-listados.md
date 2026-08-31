# I-10: Consistencia visual, navegación y listados

## Estado

Implementación y verificación automatizada concluidas el 2026-08-14 por decisión
explícita del responsable del producto. La validación manual de contraste, teclado,
lector de pantalla y dispositivos reales permanece dentro de I-08 y `PV-19`.
El 2026-08-30 se incorporó el patrón global de encabezado y filas alternas solicitado
para distinguir registros consecutivos.
El 2026-08-30 se confirmó además que las cards métricas pertenecen exclusivamente al
Dashboard; las demás pantallas no presentan resúmenes métricos independientes.

## Trazabilidad

- RF-008..016 y RF-066..075; RN-005..008 y RN-031..034; CU-03 y CU-15..18.
- ADM-02..05 y ADM-08..10; COR-02, COR-05, COR-12..15; DOC-02 y DOC-10.
- RNF-001..036 como cobertura no funcional agregada; no se asignan CP individuales
  porque sus enunciados formales no constan en el repositorio.
- No depende de una decisión `POR VALIDAR`: no altera permisos, estados, datos,
  infraestructura ni reglas académicas.

## Decisión confirmada

- El color de fondo de la aplicación se conserva y las superficies interactivas usan
  tokens semánticos diferenciados en claro y oscuro.
- ADM-04 deja de ocultar catálogos tras pestañas. `Estructura académica` es un menú del
  sidebar con rutas hijas para Facultades, Carreras, Campus, Modalidades y Periodos
  académicos.
- La relación Facultad → Carrera continúa normalizada y visible; campus, modalidades y
  periodos siguen siendo catálogos independientes.
- Toda barra de consulta presenta búsqueda primero, filtros después y la acción Aplicar
  al final, con un patrón responsive compartido.
- Todo listado tabular usa el mismo pie de paginación. Los paginadores de Laravel
  continúan en servidor; las colecciones acotadas de una vista de detalle usan el mismo
  control sobre paginación local.
- Toda tabla diferencia el encabezado mediante un tono semántico y alterna el fondo de
  sus registros: la primera fila conserva la superficie base y la segunda usa el tono
  alterno. El patrón se repite y conserva su correspondencia en columnas fijas y hover.
- Todo módulo autenticado usa `PageFrame` como contrato de encabezado: icono de Lucide
  dentro de una superficie semántica, un único `h1`, descripción, separación responsive
  y espacios opcionales para regreso, estado y acciones. Configuración aplica el patrón
  una vez en su layout y conserva Perfil, Seguridad y Apariencia como subsecciones.
- Toda columna **Acciones** usa exclusivamente `TableActionsMenu`: la celda muestra el
  icono de tres puntos y las acciones aparecen al abrirlo. La regla también aplica a una
  única acción y a registros bloqueados, cuyo menú explica el estado con una opción
  deshabilitada.
- `StatTile`, las cards métricas y cualquier resumen independiente cuyo contenido
  principal sea un conteo, total, promedio o porcentaje se reservan al Dashboard.
  COR-04, COR-12, COR-13 y DOC-03..04 no muestran bloques métricos; los valores que
  formen parte del contexto operativo de una fila o contenido pueden permanecer.

## Pasos

- [x] Auditar tema, navegación, filtros, tablas y requisitos relacionados.
- [x] Diferenciar fondo, tarjetas, popovers, entradas y sidebar mediante tokens.
- [x] Reemplazar las pestañas de ADM-04 por submenús y rutas propias.
- [x] Unificar orden y distribución de búsqueda, filtros y acción.
- [x] Aplicar una paginación compartida a todos los listados tabulares.
- [x] Diferenciar encabezados y registros consecutivos con colores alternos compartidos.
- [x] Agrupar las acciones de tabla en un menú compartido de tres puntos.
- [x] Incorporar al patrón las materias y relaciones del desglose manual de malla.
- [x] Normalizar icono, título, descripción y espaciado de todos los módulos autenticados.
- [x] Retirar cards y resúmenes métricos independientes fuera del Dashboard y proteger
      esa frontera.
- [x] Cubrir el patrón con pruebas de arquitectura y pruebas funcionales de consulta.
- [x] Actualizar producto, arquitectura, trazabilidad y evidencia de verificación.

## Evidencia

- `ManagementCreationUiTest` inventaría 24 superficies tabulares y exige exactamente un
  `TablePagination` compartido por cada una; también protege el orden búsqueda → filtros
  → aplicar, descubre automáticamente las 16 columnas **Acciones** actuales y exige el
  menú de tres puntos compartido, además de proteger 29 páginas operativas y el layout de
  Configuración con `PageFrame`, los submenús de ADM-04 y la separación de tokens.
- `ResponsiveTableTest` protege los tokens del encabezado, las filas impares/pares y la
  continuidad del color en las celdas fijas de acciones y detalle móvil.
- `MetricCardsScopeTest` reserva `StatTile` y los resúmenes métricos al Dashboard y
  comprueba que convocatorias, informes, mallas y sílabos no los reintroduzcan con otra
  presentación visual.
- `composer verify` aprobó el ajuste del 2026-08-30 sobre una base PostgreSQL temporal
  aislada: escaneo de secretos, ESLint, Prettier, TypeScript, Pint, Larastan, 268 pruebas
  con 3.178 aserciones y build Vite de producción.
- `AcademicStructureTest` comprueba las cinco rutas hijas de Estructura académica y la
  redirección compatible desde la ruta anterior.
- `DocumentOperationsTest` e `InstitutionalImportTest` —esta última retirada con el módulo
  de importación el 2026-08-27— comprueban las búsquedas nuevas y
  que los filtros continúen paginados en servidor.
- `composer verify`: 145 pruebas y 1.765 aserciones; escaneo de secretos, ESLint,
  Prettier, TypeScript, Pint, Larastan nivel 7 y build Vite aprobados el 2026-08-14.

## Riesgos y reversión

- No se modifica el esquema ni se añade una tabla genérica: las migraciones normalizadas
  permanecen intactas.
- La paginación local solo se usa para datos ya cargados y acotados en pantallas de
  detalle; las colecciones de volumen variable conservan paginación PostgreSQL.
- Los filtros nuevos consultan únicamente campos seguros ya visibles y validan su
  longitud antes de construir búsquedas `ILIKE` escapadas.
- Los tokens permiten revertir o ajustar contraste sin introducir variantes visuales por
  página.
