# I-10: Consistencia visual, navegación y listados

## Estado

Implementación y verificación automatizada concluidas el 2026-08-14 por decisión
explícita del responsable del producto. La validación manual de contraste, teclado,
lector de pantalla y dispositivos reales permanece dentro de I-08 y `PV-19`.

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
- Todo módulo autenticado usa `PageFrame` como contrato de encabezado: icono de Lucide
  dentro de una superficie semántica, un único `h1`, descripción, separación responsive
  y espacios opcionales para regreso, estado y acciones. Configuración aplica el patrón
  una vez en su layout y conserva Perfil, Seguridad y Apariencia como subsecciones.

## Pasos

- [x] Auditar tema, navegación, filtros, tablas y requisitos relacionados.
- [x] Diferenciar fondo, tarjetas, popovers, entradas y sidebar mediante tokens.
- [x] Reemplazar las pestañas de ADM-04 por submenús y rutas propias.
- [x] Unificar orden y distribución de búsqueda, filtros y acción.
- [x] Aplicar una paginación compartida a todos los listados tabulares.
- [x] Agrupar las acciones de tabla en un menú compartido de tres puntos.
- [x] Normalizar icono, título, descripción y espaciado de todos los módulos autenticados.
- [x] Cubrir el patrón con pruebas de arquitectura y pruebas funcionales de consulta.
- [x] Actualizar producto, arquitectura, trazabilidad y evidencia de verificación.

## Evidencia

- `ManagementCreationUiTest` inventaría 26 superficies tabulares y exige exactamente un
  `TablePagination` compartido por cada una; también protege el orden búsqueda → filtros
  → aplicar, 17 superficies de acciones agrupadas, 29 páginas operativas y el layout de
  Configuración con `PageFrame`, los submenús de ADM-04 y la separación de tokens
  visuales.
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
