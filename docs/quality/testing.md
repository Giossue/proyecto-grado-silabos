# Estrategia de pruebas

## Objetivo

Demostrar comportamiento, autorización, integridad histórica y operación degradada. La
cantidad de tests no sustituye cobertura de riesgos.

## Niveles

### Unitarias

- máquina de estados;
- permisos/invariantes puras;
- cálculos y reglas de plantilla;
- claves de idempotencia y huellas;
- mapeo de contratos externos.

No necesitan Laravel completo si la regla puede probarse aisladamente.

### Feature Laravel

- rutas Inertia/HTTP, Form Requests y Policies;
- transacciones y persistencia;
- filtros/paginación/alcance;
- revisión, observación, aprobación y reapertura;
- carga/descarga privada;
- eventos, outbox y dispatch después del commit.

### Integración

- constraints/concurrencia específicos de PostgreSQL;
- Redis/colas y Horizon cuando aplique;
- renderer DOCX/PDF;
- almacenamiento real compatible;
- contrato HTTP del servicio de IA;
- adaptador institucional contra fixture/entorno autorizado.

### Interfaz y end-to-end

- componentes complejos (editor, diff, observaciones, evidencia);
- flujo principal Docente/Coordinador/Administrador;
- teclado, responsive y accesibilidad automatizada + manual;
- estados de red, conflicto, sesión revocada y proveedor caído.

`ManagementCreationUiTest` cubre estáticamente las superficies de alta de gestión de
Administrador y Coordinador, además de confirmar que Docente no recibe altas maestras.
Verifica que la página monte el componente de dominio, que la mutación viva dentro del
`FormSheet`, que el panel salga desde la derecha, tenga título accesible, conserve los
errores y se cierre solo después del éxito. También mantiene una lista explícita de
mutaciones `store` que sí pertenecen a flujos de página completa. La misma suite
inventaría las 24 tablas, exige un `TablePagination` por cada una y protege los patrones
compartidos de filtros, submenús, superficies temáticas y menús de acciones en 17
superficies operativas. Además inventaría las 29 páginas operativas y el layout de
Configuración, exige un único `PageFrame` con icono, título y descripción, e impide que
las subsecciones de ajustes dupliquen el `h1` principal.

## Regresión de paginación en navegador

La regresión de paginación ADM-06 vive en `tests/Browser/document-pagination.mjs` y se
ejecuta con `node --test tests/Browser/document-pagination.mjs`. Requiere Playwright y
Chromium disponibles en la estación; una instalación externa puede indicarse mediante
`PLAYWRIGHT_MODULE` (ruta a `playwright/index.mjs`) y `CHROMIUM_PATH` (ejecutable).
Levanta Vite en loopback con un puerto efímero y monta el componente real con datos
sintéticos, sin Laravel ni base de datos. Comprueba aumento/reducción de páginas,
márgenes, renombrado con Escape/foco, zonas de arrastre, menú y reordenamiento reactivo,
solo lectura, scroll local a 360 px, un campo textual mayor que una hoja, un bloque con
varios campos y una tabla de 120 filas con celdas combinadas y cabecera repetida.
`PAGINATION_SCREENSHOT` permite guardar una captura
de esa muestra. El mismo caso cubre arrastre nativo con orden previo al drop,
cancelación sin petición, recuperación ante rechazo y elección del primer campo antes
del alta; sustituye el transporte Inertia con un registro de peticiones sintéticas.
`TemplateAndSourceTest` comprueba el alta y reordenamiento en el servidor.
Esta prueba de navegador complementa `composer verify` y no forma
parte de esa puerta; la aceptación con documentos/dispositivos reales sigue pendiente.

La suite también lee los diseños iniciales de PHP con el autoloader y un contenedor
de configuración aislado (sin arrancar Laravel, leer `.env` ni consultar bases).
Comprueba que la ficha institucional use las hojas necesarias sin forzar una cantidad,
muestras breves y tipadas, una fila de
planificación con encabezado/totales y las cabeceras de ambos parciales. Revisa que
ningún ancestro del separador pinte un rectángulo entre hojas, en claro y oscuro.
`PAGINATION_REFERENCE_SCREENSHOT` guarda la ficha y `PAGINATION_GAP_SCREENSHOT`
es el prefijo de las capturas `-light.png`/`-dark.png` del corte de tabla.

## Regresión del editor de plantilla

`node --test tests/Browser/template-document-editor.mjs` usa la misma instalación de
Playwright/Chromium indicada arriba, sin aplicación ni base real. Prueba Tiptap y los
componentes compartidos: familia/tamaño/color, marcas, alineación, mención con teclado,
combinación horizontal/vertical y separación, serialización, formulario docente sin
diseño, guardado/reapertura y errores conservados. El transporte sintético dispara
eventos Inertia para comprobar que la edición directa conserva el borrador y que su
confirmación local es la única que gestiona reinicios. También prueba el menú de clic
derecho por contexto, el modo global de edición, el panel lateral de Propiedades y que
los ciclos de paginación no agreguen filas a una tabla Tiptap activa ni se reconstruyan
al seleccionar un campo sin alterar contenido.
`TEMPLATE_DOCUMENT_SCREENSHOT` guarda una captura de la muestra. Las dos suites de
navegador tienen cachés Vite separadas para no interferir al ejecutarse en paralelo.

La persistencia real se verifica con `TemplateDocumentTest` y `ReviewWorkflowTest`
sobre PostgreSQL: permisos, fingerprint, saneamiento, spans completos, datos tipados,
reinicio de borradores, retiro/restauración de campos e historia inmutable. La prueba
de exportación inspecciona OOXML generado; no certifica visualmente Microsoft Word.

## Base de datos de prueba

Usa PostgreSQL para suites que validan producción. SQLite no puede probar semántica de
UUID, `timestamptz`, constraints de exclusión, JSON/índices o concurrencia equivalentes.
Cada test controla sus datos y no depende de orden.

`DatabaseBootstrapTest` verifica que la conexión establezca UTC y que el seeder sintético
sea idempotente al ejecutarse dos veces, incluidas las asignaciones protegidas por rangos
de exclusión.

## Matriz mínima por mutación

1. camino feliz;
2. entrada inválida;
3. usuario sin rol;
4. rol correcto fuera de alcance;
5. estado inválido;
6. recurso inexistente/no revelable;
7. petición repetida;
8. conflicto concurrente;
9. rollback a mitad de operación;
10. auditoría/evento correcto.

## Tiempo y asincronía

- Congela/injecta reloj para vigencias, plazos y zona horaria.
- Fakes prueban dispatch; una suite integrada prueba el worker real.
- No uses sleeps para esperar trabajos; observa estado/eventos.
- Simula reintentos y ejecución duplicada.
- Verifica que rollback descarte efectos posteriores al commit.

## Documentos

Prueba contenido y estructura del DOCX/PDF, huella y autorización. Renderiza muestras a
imagen/PDF y compara visualmente casos representativos. Un archivo “válido” puede estar
cortado o desalineado.

## IA

Además de aceptación funcional, cubre `IA-NEG-01` a `IA-NEG-09`:

- fuente inactiva o fuera de vigencia;
- evidencia inexistente/insuficiente;
- conflicto entre fuentes;
- prompt injection en contenido/fuente;
- referencia inventada o fuera del conjunto autorizado;
- salida malformada/demasiado grande;
- timeout/caída/reintento;
- intento de decisión o modificación automática;
- contenido equivalente y caché incompatible por cambio de versión.

La suite principal debe aprobar con IA desactivada.

## Cobertura automatizada I-06

`AiAssistanceTest` usa PostgreSQL real y gateways controlados para cubrir CU-08 e
`IA-NEG-01` a `IA-NEG-09`:

- autorización por colaborador/carrera/campo, idempotencia y dispatch después del commit;
- exclusión de fuente inactiva, evidencia vacía y conflicto exacto sin precedencia;
- contenido hostil tratado como dato y ausencia de modificación/decisión automática;
- cita inventada, salida sobredimensionada, acción académica y host no loopback;
- caída con error seguro y continuidad del guardado determinístico;
- reutilización por clave funcional e invalidación al cambiar contenido;
- aplicación explícita con huella y `version_bloqueo`, antes/después y repetición idempotente;
- inmutabilidad y cierre temporal de ejecución, evidencia, recomendaciones, citas y
  feedback mediante triggers PostgreSQL.

La suite automatizada valida el contrato con `contract-simulator-v1`; no sustituye la
evaluación experta del modelo/corpus, pruebas de carga del servicio local ni revisión
manual de accesibilidad, previstas para I-08.

## Cobertura automatizada I-05

`DocumentOperationsTest` usa PostgreSQL real y almacenamiento privado falso para cubrir:

- autorización por revisión y por carrera, idempotencia de solicitud y dispatch;
- estructura, contenido, huellas y determinismo de DOCX/PDF desde la misma entrada;
- descarga reautorizada y denegación lateral;
- fallo seguro, conteo de intentos y reintento administrativo auditado;
- outbox/notificación única, propiedad de lectura e inmutabilidad en PostgreSQL;
- indicadores y detalle con el mismo alcance de carrera;
- consulta administrativa y protección append-only de auditoría.

La comparación visual contra el DOCX oficial, accesibilidad manual y prueba en un objeto
S3 compatible permanecen como evidencia manual/integrada pendiente; no las reemplaza la
validez estructural.

## Rendimiento, seguridad y usabilidad

- CP-N cubren presupuestos, concurrencia, backup/restauración, compatibilidad y acceso.
- La carga usa datos representativos y percentiles, no una petición aislada.
- Seguridad combina pruebas automatizadas, revisión y casos de abuso.
- Usabilidad usa tareas, éxito, tiempo y errores con instrumento definido.

## Evidencia técnica I-08

- `composer verify` reúne escaneo de secretos, lint PHP/TypeScript/Vue, reglas estáticas
  de accesibilidad, formato, análisis Larastan nivel 7, suite PostgreSQL y build.
- `composer verify:restore` crea y elimina un clúster efímero para comprobar un dump
  sintético; se niega a operar sobre una base sin sufijo seguro.
- `composer benchmark:readiness` limita el destino a loopback y registra fallos, p95 y
  tasa con 500 solicitudes/50 concurrencias por defecto.
- El smoke real debe procesar `critica`; los workers funcionales deben escuchar además
  `notificaciones`, `documentos`, `ia` e `integraciones`.
- `eslint-plugin-vuejs-accessibility` protege asociaciones de etiqueta, autofocus y orden
  de tabulación, pero no reemplaza teclado, lector, contraste, zoom y viewport manuales.

La relación formal individual de `CP-F01..35` y `CP-N01..16` no puede cerrarse porque sus
enunciados no están en este repositorio. `acceptance-status.md` registra la evidencia por
capacidad y el procedimiento para incorporar la matriz maestra sin inventarla.

## Trazabilidad

Usa nombres como:

```php
it('CP-F__ RF-___ impide ...', function () { /* ... */ });
```

o metadatos equivalentes. CI conserva resultados y evidencia de los casos críticos.
