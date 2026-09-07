# I-56 — Editor de plantilla con formato y campos

## Autoridad y alcance

2026-09-06: el responsable pide terminar el editor integrado, sin laboratorio ni
suite de oficina. Solo Administración diseña la plantilla; Docencia completa sus
campos y no cambia su estructura. Variables descriptivas (`@nombre_carrera`) se
resuelven en servidor. Se conserva la hoja y la organización por bloques de I-53.
Esta decisión sustituye expresamente la restricción de I-34 a tablas prefabricadas
y a la ficha institucional dibujada exclusivamente en código.

RF-017..026, RF-034..044 y RF-066..074; RN-009..012, RN-031..034; CU-04/06/15;
ADM-06, DOC-01 y COR-06; CP-F documentos y CP-N seguridad/compatibilidad;
RNF de seguridad, interoperabilidad y usabilidad. PV-07/PV-12/PV-19 no se cierran;
no se cambian fórmulas pendientes de PV-08 ni permisos excepcionales de PV-16.

## Contrato

- Documento JSON acotado y validado dentro de `bloques_plantilla.configuracion`:
  párrafos, listas, tablas, celdas combinadas, formato permitido, variables y campos.
- Catálogo de variables central en PHP; ningún dato académico se acepta del cliente.
- Campos docentes conservan definiciones y valores tipados. Las tablas repetibles
  conservan columnas, unidades y sumas; su diseño identifica las filas que se repiten.
- Diseños anteriores se adaptan sin escribir al abrir. Guardado explícito transaccional,
  control de conflicto y bloqueos/confirmación de I-32. Revisiones incluyen diseño y
  valores resueltos; las históricas sin diseño siguen usando el lector anterior.
- Retirar campos del diseño conserva definición, datos y evidencia histórica;
  deshabilita obligatoriedad, escritura e IA y restaura esas opciones si se reinsertan.
  No se requieren migraciones. Procesos cerrados no cuentan como trabajo en curso.
- Tiptap 3 (núcleo/extensiones MIT) encapsulado en un componente Vue: selección,
  deshacer/rehacer, celdas y marcas. No servicios externos, HTML libre persistido,
  imágenes pegadas, scripts ni extensiones comerciales. PHPWord sigue exportando.

## Plan y aceptación

- [x] Validación, catálogo, adaptación y guardado autorizado del diseño.
- [x] Editor: familia/tamaño/color, negrita/cursiva/subrayado, alineación, filas,
      columnas, combinar/separar, campos y sugerencias `@` con teclado.
- [x] Docente solo llena datos; vista de revisión y DOCX conservan el diseño.
- [x] Snapshot, permiso, conflicto, entradas hostiles y regresión de tablas.
- [x] Navegador real, tipos, análisis y formato del incremento; documentación al día.
- [ ] Puerta global verde y aceptación con usuarios/dispositivos reales (véase abajo).

## Verificación

2026-09-06, PostgreSQL y Redis locales, fixtures sintéticas. Sin migraciones ni
operaciones sobre bases externas; sin commit/push.

- Configuración + Sílabos + Documentos + `ManagementCreationUiTest`: **122 pruebas,
  2695 aserciones**, pasan. Incluyen pausa/reinicio, retiro de campos con historia,
  guardado de propiedades sin cambiar tipos, conflicto y protección de layout.
- `composer types:check`, `npm run types:check`, Pint y compilación: pasan.
- Las dos suites Chromium pasan juntas (**2/2**): `template-document-editor.mjs`
  y `document-pagination.mjs`. Incluyen teclado `@`, portapapeles HTML de tokens,
  combinaciones, guardado/reapertura, errores y confirmación local, docente, 360 px,
  modo oscuro y regresión de 120 filas. Usan cachés Vite independientes y esperan
  que la opción de sugerencia esté lista antes de pulsar Enter.
- `npm audit --omit=dev`: cero vulnerabilidades reportadas. Bundle administrativo
  aproximadamente 490 kB (154 kB gzip); el lector docente es independiente del editor.
- `php artisan test`: **378/381** pasan, 5581 aserciones; tres fallos preexistentes en
  contratos visuales de `ManagedUserSheet` y `PeriodPreparationSheet`, sin cambios aquí.
- `composer verify`: se intentó y se detuvo en nueve errores ESLint del archivo externo
  `temp/.venv/.../urllib3/contrib/emscripten/emscripten_fetch_worker.js`. La comprobación
  global de Prettier también señala nueve archivos ajenos al editor. No se corrigieron
  terceros, no se silenciaron reglas y no se declara esa puerta aprobada.

La revisión de capturas con datos sintéticos incluye escritorio claro y 360 px oscuro;
se conserva scroll local y acceso a guardar/cancelar. El guion con participantes,
lector de pantalla y dispositivos reales sigue pendiente de aceptación. PDF mantiene
el respaldo de texto existente; no se declara fidelidad visual PDF ni equivalencia de
paginación con Microsoft Word. El plan queda activo por estas verificaciones generales
y aceptación, aunque la implementación del editor está disponible.

## Recuperación

Un rechazo de validación/conflicto no escribe; el diseño local sigue abierto. Deshacer
actúa antes de guardar. Ante un despliegue revertido, conservar JSON y definiciones:
no borrar datos para volver al lector anterior. Las revisiones enviadas llevan su copia
y los artefactos existentes permanecen intactos. Los dos archivos de la galería antigua
se retiraron por sustitución funcional y son recuperables desde Git; el laboratorio
previamente retirado no se reintrodujo.

## Ajuste de la vista previa y referencia de formato (2026-09-06)

El responsable aporta una captura de un fondo blanco que tapa el espacio entre
hojas y `temp/silabo.pdf` como referencia para la plantilla estándar. El PDF tiene
ocho páginas Carta; esa cantidad depende de su contenido y no se fija en el editor.
Se conserva el formato editable, las variables y los campos docentes. No se copian
datos personales, notas, fórmulas ni valores académicos del documento a las muestras;
PV-07/PV-08/PV-19 siguen abiertas. Alcance: ADM-06, CU-04, RF-017..026,
RN-009..012, RNF-018..023 y CP-F plantilla/CP-N interfaz.

- [x] Corregir el fondo de la vista previa paginada sin alterar la superficie del
      formulario docente ni los colores de las celdas; compactar el relleno vertical
      de las celdas en editor y lector sin reducir la fuente elegida.
- [x] Sustituir el relleno extenso por ejemplos breves y tipados; una fila de ejemplo
      por tabla, conservando encabezados y totales de las unidades.
- [x] Contrastar las secciones y tablas iniciales con el PDF, sin sobrescribir
      plantillas guardadas ni importar datos de docentes. Añadir la tabla faltante
      de indicadores de ambos parciales, sin fórmulas ni valores predeterminados.
- [x] Cubrir separación entre hojas y ejemplos en navegador real; ejecutar las
      verificaciones puntuales y actualizar trazabilidad.

Verificación puntual: Configuración + Sílabos + Documentos, **98 pruebas y 1619
aserciones**, pasan en PostgreSQL local aislado. El contrato de hoja de
`ManagementCreationUiTest` pasa (1 prueba, 61 aserciones). ESLint/Prettier del
incremento, tipos Vue, Pint y PHPStan de las clases afectadas pasan. No hay
migraciones ni escrituras sobre la plantilla existente. No se repite la puerta
global para este ajuste acotado ni se dan por resueltos sus pendientes anteriores.

Las dos suites Chromium pasan juntas (**2/2**). Se inspeccionaron la ficha de
ejemplo en una página y la tabla de 120 filas en claro/oscuro, con sus separaciones
y números de página visibles. El arrastre nativo observa el orden en la fase de
captura de `drop`, antes de la mutación; la mención usa foco por clic como el usuario,
sin competir con el foco diferido de Tiptap. No se cambiaron esos comportamientos de
producción para acomodar la prueba.
