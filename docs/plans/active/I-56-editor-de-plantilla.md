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

## Seguimiento — propiedades dentro de Editar diseño (2026-09-07)

Petición del responsable: reunir las propiedades con el diseño. Alcance: ADM-06,
CU-04, RF-017–026, RN-009–012 y RNF-018–023; sin cambiar roles ni decisiones PV.

- [x] Separar Diseño y Propiedades en el mismo diálogo, con nombre, ayuda e IA.
- [x] Guardar conjuntamente y conservar borradores entre pestañas; cancelar descarta
      ambos. Retirar el Sheet de propiedades y mantener protegidos los datos del flujo.
- [x] Validar alcance, concurrencia y retirada de campos en servidor; probar interfaz
      y persistencia, y actualizar documentación/trazabilidad.

Este incremento se centra en propiedades; no da por implementado el atajo
`@docente` ni el traslado de los tipos de contenido propuestos anteriormente.

Verificado: Configuración y contratos de interfaz afectados, **28 pruebas y 359
aserciones**; las dos suites Chromium, **2/2**; Vue TypeScript, ESLint y formato
del incremento, Pint y PHPStan de las clases afectadas. Revisión visual de
Propiedades en escritorio claro y a 360 px en oscuro, sin desbordamiento horizontal,
con pie visible y contenido desplazable. El transporte del navegador es sintético;
la persistencia y autorización se prueban en PostgreSQL local aislado. Sin
migraciones, cambios a datos institucionales, commit ni push. No se repitió la
puerta global ni se consideran resueltos sus pendientes anteriores.

## Seguimiento — completar reorganización y @docente (2026-09-07)

Petición confirmada: completar lo pendiente, no solo trasladar Propiedades.
Alcance ADM-06/DOC-01, CU-04/06/15, RF-017..026/037..044/066..074,
RN-009..012/031..034 y RNF-018..023. Sin nuevas dependencias ni cambios de roles.

- [x] Agrupar herramientas en Formato, Tablas y Campos, manteniendo el lienzo visible.
- [x] Insertar con `@docente` una referencia independiente editable por el docente,
      también dentro de celdas; editar nombre/formato desde el mismo panel.
- [x] Retirar tipo/renombrado del menú externo; gestionar texto, listas y tablas
      dentro del diseño sin convertir ni perder los datos existentes.
- [x] Comprobar listas en lectura/exportación, guardado, teclado y móvil; actualizar
      documentación y verificaciones. Las variables automáticas siguen separadas.

Verificación: **102 pruebas / 1656 aserciones** de Configuración, Sílabos y
Documentos en PostgreSQL local aislado; contrato de arquitectura de la hoja y
**2/2 suites Chromium**. Pasan TypeScript, ESLint/Prettier del incremento, Pint,
PHPStan de las clases modificadas y el escaneo de secretos. Revisión visual del
diálogo en escritorio claro y móvil oscuro. La prueba observa que ProseMirror haya
colocado el cursor en la celda después del foco nativo antes de escribir; no mueve
la selección con una API para insertar `@docente`. Se conserva NodeSelection al
renombrar o cambiar el formato, sin conversiones de tipos existentes. Sin
migraciones ni modificaciones de datos institucionales. No se repite la puerta
global ni se dan por cerrados sus pendientes previos.

## Seguimiento — renombrado en Propiedades (2026-09-07)

Petición confirmada: los campos existentes se renombran junto a su ayuda e IA en
Propiedades, no al seleccionarlos dentro del lienzo. Alcance ADM-06, CU-04,
RF-017..026, RN-009..012 y RNF-018..023; sin cambios de rol ni de tipo persistido.

- [x] Mostrar solo «Nombre del bloque» cuando contiene un campo; con dos o más,
      mostrar además «Nombre del campo» en cada ficha de Propiedades.
- [x] Mantener en Campos el nombre solo durante el alta de `@docente`; un campo ya
      guardado permite cambiar su presentación, pero remite a Propiedades para renombrar.
- [x] Guardar etiqueta, documento y propiedades en la misma transacción, con alcance,
      concurrencia y validación; cubrir interfaz, servidor y documentación.

Verificación: **102 pruebas / 1658 aserciones** de Configuración, Sílabos y
Documentos en PostgreSQL local aislado; contrato ADM-06 puntual, **14 pruebas /
188 aserciones**; y **2/2 suites Chromium**. Pasan TypeScript, ESLint/Prettier,
Pint y PHPStan del incremento. La revisión visual confirma una sola entrada, rotulada
«Nombre del bloque», en bloques de un campo. No se hicieron commit ni push.

## Seguimiento — respuesta inicial en tablas libres (2026-09-07)

- [x] Presentar el único recuadro como «Respuesta del docente» y mostrar etiquetas
      descriptivas solo al existir varios campos.
- [x] Retirar el carácter decorativo `▧` de todos los campos y de las instrucciones.
- [x] Al insertar una tabla sobre el documento inicial, trasladar ese campo a la
      primera celda de contenido y no dejar una copia fuera.
- [x] Dejar las demás celdas libres; los campos adicionales se crean explícitamente
      con `@docente`.
- [x] Verificar TypeScript, formato, lint, contrato de arquitectura y Chromium.

Verificación: TypeScript, Prettier y ESLint puntual; **24 pruebas / 1116
aserciones** del contrato de arquitectura y **1/1 suite Chromium** del editor.
No se hicieron commit ni push.

## Seguimiento — edición directa y herramientas contextuales (2026-09-07)

Petición confirmada: retirar el diálogo grande y editar el diseño en la propia hoja,
con una experiencia progresiva similar a un procesador de texto. Se conservan ADM-06,
CU-04, RF-017..026, RN-009..012 y RNF-018..023, sin ampliar permisos.

- [x] Reemplazar el diálogo de diseño por edición directa en el bloque, con guardar,
      cancelar, estado y confirmaciones existentes.
- [x] Mostrar formato al seleccionar texto, herramientas de tabla al seleccionar una
      celda y configuración del campo al seleccionar su marcador.
- [x] Reunir tabla, `@docente` y variables automáticas bajo «Insertar».
- [x] Mover propiedades del bloque y de sus campos a un panel lateral, conservando
      ayuda, IA, validación y guardado atómico.
- [x] Actualizar regresiones, documentación y revisión visual responsive.

Verificación: TypeScript, ESLint y Prettier del incremento; **24 pruebas / 1126
aserciones** del contrato de arquitectura y **1/1 suite Chromium** del editor. La
revisión visual cubre edición directa y barra contextual en escritorio, además del
panel lateral a 360 px en modo oscuro sin desbordamiento. La regresión conserva
formato, tablas complejas, campos, variables, cancelación, error, confirmación de
reinicio y reapertura persistida. Sin migraciones, commit ni push.

## Seguimiento — modo de edición documental y menú contextual (2026-09-07)

La edición directa por bloque no corresponde a la interacción confirmada. ADM-06 debe
presentar la plantilla limpia y ofrecer un único modo «Editar documento». Dentro de ese
modo, el clic derecho abre acciones según el punto del documento, como en un procesador
de texto. PHPWord permanece exclusivamente en exportación DOCX.

- [x] Sustituir los accesos de diseño por bloque por un único control de edición para
      toda la hoja, ocultando paleta, arrastre y herramientas fuera de ese modo.
- [x] Reemplazar la barra flotante por un menú contextual accesible para texto, tablas
      y campos, con submenús de inserción, eliminación y formato.
- [x] Mantener variables `@`, campos docentes, tablas complejas, propiedades laterales,
      errores, conflictos y confirmación de reinicio.
- [x] Coordinar cambios pendientes y guardado desde el nivel del documento sin alterar
      autorización, snapshots ni el contrato JSON persistido.
- [x] Actualizar pruebas, documentación y revisión visual en escritorio y móvil.

Verificación: build de producción, TypeScript, ESLint y Prettier del incremento; Pint;
**37 pruebas / 1264 aserciones** entre el contrato de arquitectura y
`TemplateDocumentTest`; y **2/2 suites Chromium** para editor y paginación. La revisión
visual cubre el documento global en tres páginas, el menú contextual de campo y el panel
de Propiedades a 360 px. Sin migraciones, commit ni push.

## Corrección — tablas crecientes durante la edición (2026-09-07)

- [x] Impedir que los espaciadores visuales de página se inserten dentro del DOM de
      una tabla administrada por Tiptap.
- [x] Mantener cada editor activo como unidad de paginación sin cambiar el documento
      JSON ni la exportación.
- [x] Cubrir la regresión con una tabla editable de 24 filas estable durante múltiples
      ciclos de renderizado y paginación.
- [x] Evitar repaginaciones por clases transitorias de selección, foco y arrastre; la
      regresión confirma cero reconstrucciones de espaciadores al seleccionar un campo.

## Reinicio de la interacción de plantilla (2026-09-07)

Por indicación del usuario, ADM-06 queda temporalmente con una hoja carta vacía para
diseñar la nueva interacción desde cero. La ruta y los datos existentes se conservan;
no se eliminan plantillas de PostgreSQL ni se reutiliza todavía el editor anterior.

- [x] Retirar de la pantalla el constructor, sus acciones y alertas.
- [x] Conservar el encabezado compartido, el layout autenticado y una hoja carta vacía.
- [x] Definir la nueva interacción: el bloque agrupa campos y cada campo elige su
      presentación (texto, tabla, lista con viñetas o lista numerada).

## Constructor progresivo desde la hoja (2026-09-07)

Nueva indicación del responsable: tomar de la malla el patrón de alta progresiva, no su
motor de grafos. ADM-06 parte de la hoja; «Agregar bloque» abre un `Popover` para nombrar
el bloque y declarar uno o varios campos con su tipo antes de escribir. La creación es
atómica y no deja bloques vacíos si se cancela o falla. Se conservan los datos ya
persistidos; este cambio no autoriza a borrar la plantilla existente.

La personalización es deliberadamente acotada y se guarda en
`plantillas_silabo.mapeo_documento`: familia y jerarquía tipográfica, colores de texto,
acento y cabecera de tabla, negrita/cursiva/alineación de títulos, márgenes y orientación.
La estructura y la apariencia siguen separadas; las revisiones conservan el mapa en su
fotografía y PHPWord lo usa al exportar.

- [x] Crear bloques con múltiples campos tipados desde la hoja.
- [x] Mostrar y personalizar la hoja sin recuperar el editor documental anterior.
- [x] Aplicar la apariencia guardada a la paginación y al DOCX.
- [x] Cubrir autorización, validación, creación atómica, snapshot e interfaz.

Verificación: Configuración, Sílabos, Documentos y contrato de arquitectura,
**129 pruebas / 2801 aserciones** en PostgreSQL local aislado; la suite Chromium
`template-visual-builder.mjs`, **1/1**, crea un bloque con campos de texto y tabla,
comprueba la previsualización horizontal, tipografía y color, guarda la apariencia y
revisa el ancho móvil. Pasan TypeScript, ESLint y Prettier del incremento, build de
producción, Pint y PHPStan de las clases modificadas. Sin migraciones ni modificaciones
de los diseños persistidos, commit o push. La configuración estructural detallada de
tablas queda fuera de este primer incremento, tal como se documenta en ADM-06.

## Seguimiento — estilo contextual de tablas (2026-09-07)

El responsable confirma que Administración debe poder editar sobre la hoja el estilo
de las tablas, incluida la ficha institucional, sin recuperar el editor documental
global. El alcance añade formato visual y geometría de celdas; no permite a Docencia
cambiar la plantilla ni elimina los diseños persistidos. Los selectores de tipo de
campo usan los componentes `Select` de shadcn-vue dentro de sus `Popover`.

- [x] Corregir la aplicación del color global para distinguir cabeceras reales de
      filas fijas y conservar el estilo propio de la ficha institucional.
- [x] Permitir seleccionar una o varias celdas y ajustar fondo, texto, negrita,
      cursiva, alineación y borde; combinar o separar cuando la selección lo admita.
- [x] Guardar el documento normalizado con autorización, bloqueo, confirmación y
      concurrencia existentes; reflejar el estilo en vista, snapshot y DOCX.
- [x] Sustituir los selectores nativos de tipo de campo por `Select` de shadcn-vue sin
      cerrar el `Popover`; cubrir el flujo real, el ancho móvil y las regresiones.

Verificación: Configuración, Sílabos, Documentos y contrato de arquitectura,
**130 pruebas / 2848 aserciones**; Chromium `template-visual-builder.mjs`, **1/1**, crea
un campo de tabla mediante el `Select` de shadcn-vue y guarda dos celdas combinadas con
fondo, texto, alineación, negrita y borde. Pasan TypeScript, ESLint y Prettier del
incremento, build de producción, Pint y PHPStan. La regresión OOXML comprueba los estilos
por celda y que una fila fija no reciba el color global de cabecera. Sin migraciones,
commit ni push.

## Seguimiento — controles icónicos contextuales (2026-09-07)

- [x] Compactar las herramientas de celda con iconos, nombres accesibles y `Tooltip` de
      shadcn-vue, conservando los `Select` y menús existentes.
- [x] Sustituir los accesos textuales de alta por iconos y ordenar **Agregar campo** sobre
      **Agregar bloque** dentro del encabezado de cada bloque.
- [x] Cubrir apertura de `Popover`/`Select`, ayudas, orden visual y guardado de estilos en
      la regresión Chromium del constructor.

Verificación puntual: build de producción, TypeScript, ESLint, Pint, contrato de
arquitectura (**1 prueba / 98 aserciones**) y `template-visual-builder.mjs`, **1/1**.
Revisión visual en escritorio de la columna de altas y la barra de tabla. Sin cambios de
datos, migraciones, commit ni push.
