# Estado de decisiones

Fecha de corte: **30 de agosto de 2026**.

## Etiquetas

- `CONFIRMADO`: acordado por los autores o establecido en la línea base.
- `PROPUESTO`: decisión técnica razonada que puede ajustarse mediante ADR.
- `POR VALIDAR`: requiere entrevistas, autoridad institucional o evidencia técnica.
- `DERIVADO`: conclusión coherente con fuentes confirmadas; debe conservar trazabilidad.

## Confirmado

- Producto centralizado, configurable y trazable para el ciclo de vida del sílabo.
- Alcance inicial: Carrera de Software UEB.
- Roles: Administrador, Coordinador y Docente.
- Estados: Sin iniciar, Borrador, En revisión, Corrección solicitada y Aprobado.
- Enviar y reenviar crea revisión inmutable.
- Aprobar vuelve inmutable la revisión.
- Reabrir crea una nueva revisión enlazada y conserva la aprobada.
- La plantilla institucional es única y se edita en el sitio; no hay versiones ni
  publicación (I-32, 2 de septiembre de 2026). Cada revisión enviada conserva su copia
  completa de la estructura y del mapa de exportación, que es lo que la protege.
- Las fuentes académicas son documentos de la Coordinación (I-26, 1 de septiembre
  de 2026): nombre, descripción, notas internas y contenido Markdown editable, sin
  versiones, fragmentos ni conflictos. Administración no participa. La evidencia de IA
  conserva nombre, extracto y huella del contenido en el momento del análisis.
- La plantilla de sílabo es única e institucional: no pertenece a una carrera y la usan
  las convocatorias de cualquier carrera tal como esté al abrir el proceso.
- La plantilla se arma sobre la hoja impresa (I-33) y sus tablas complejas se describen
  con un esquema plano: columnas, grupos y agrupamientos de cabecera (dos niveles),
  datos de unidad, totales y repetición por unidad (I-34, 2 de septiembre de 2026). El
  DOCX se genera con PhpWord a partir de la copia de cada revisión; el PDF sigue siendo
  el respaldo de texto plano hasta decidir el motor de PDF.
- La modalidad de estudio es un dato de la carrera (la aprueba el CES); una modalidad
  «por materia» (híbrida) se indica en cada materia de la malla y la oferta la hereda en
  vez de elegirla (I-35, 3 de septiembre de 2026). La ley fija componentes ACD/APE/AA,
  unidades de organización curricular y créditos de 48 h; el dibujo de la malla y el
  formato del sílabo son institucionales, no ministeriales.
- La IA es asistencia explicable; no toma decisiones académicas ni bloquea el flujo.
- Stack base: Laravel 13, Vue/Inertia, TypeScript, PostgreSQL y Redis.
- Monolito modular y servicio local de IA desacoplado por HTTP.
- Integración institucional sin escritura directa en la base de la UEB.
- Gobierno académico distribuido: Administrador mantiene facultades, carreras, cuentas y
  coordinaciones; Coordinador gestiona mallas, materias, ofertas, paralelos y asignaciones
  docentes exclusivamente dentro de su carrera.
- La identidad de las cuentas se administra de forma centralizada: solo el Administrador
  puede corregir nombre o correo. Coordinadores y Docentes solicitan esos cambios a
  Administración, incluso cuando se trata de la cuenta propia.
- La estructura institucional se presenta y persiste como Facultad → Escuela → Carrera,
  según el esquema real de la fuente verificado en I-11. Campus y modalidades siguen
  siendo catálogos independientes; un campus participa en una oferta académica y no se
  mezcla ni se duplica como facultad o carrera. El periodo académico deja de ser catálogo
  global: pertenece a una carrera, porque en la fuente `periodo_lectivo.cod_carr` es
  obligatorio y el mismo nombre de periodo se repite una vez por carrera con fechas
  propias.
- Administración puede corregir los metadatos de esos catálogos, reasignar una carrera a
  otra facultad activa y archivar o reactivar registros. Cada edición conserva valores
  anterior/nuevo en auditoría; no existe borrado físico de catálogos con historia.
- La posición curricular visible de una materia se denomina ciclo; periodo académico
  continúa siendo la ventana temporal con fechas.
- Cada carrera tiene cero o una sola malla actual, configurable en ciclos y campos. El
  documento de Software es una referencia visual, no una plantilla universal;
  Coordinación edita la misma malla mediante constructor y formulario, puede
  deshabilitarla/reactivarla y solo la elimina si no tiene ofertas ni sílabos.
- Sin una malla activa no se crean ofertas ni se abren procesos nuevos para docentes.
  Los sílabos conservan una fotografía de su contexto académico y las revisiones siguen
  siendo inmutables aunque la malla actual cambie.
- El calendario académico oficial obliga a toda la universidad (I-31, 2 de septiembre
  de 2026): Administración abre el **proceso de sílabos** con plantilla y fechas;
  Coordinación convoca a su carrera dentro de ese proceso y hereda ambas. Con el
  proceso abierto la plantilla no se edita; con una convocatoria en curso la malla y las
  fuentes de esa carrera no se editan. Para corregir se pausa: Administración el
  proceso —toda la universidad—, Coordinación su convocatoria —solo su carrera—.

## Actualizado para esta entrega

El starter oficial vigente de Laravel 13 usa Inertia 3, Vue 3 Composition API,
TypeScript, Tailwind y shadcn-vue. Esta entrega adopta esa línea base para no iniciar el
proyecto con instrucciones obsoletas.

I-06 implementa el contrato, persistencia, cola y control humano de IA con un simulador
técnico determinista y un cliente HTTP exclusivamente local. Esto demuestra integración
y degradación segura, pero no confirma motor, modelo, hardware, corpus, precedencia ni
umbrales: `PV-02`, `PV-13`, `PV-14` y `PV-18` permanecen `POR VALIDAR`.

I-07 implementa un puerto de lectura, fixture sintético versionado, staging inmutable,
simulación y exclusión humana. Demuestra idempotencia, conflicto y cero mutación del
catálogo, pero no incorpora esquema, credenciales, red, reglas de identidad ni aplicador:
`PV-09`, `PV-10` y `PV-12` permanecen `POR VALIDAR`.

I-08 completa el carril técnico de candidato: CI y audits, reglas estáticas de
accesibilidad, cabeceras/readiness sin sesión, smoke de colas nombradas, restore
PostgreSQL efímero y baseline local reproducible. Esto no cierra los CP funcionales/no
funcionales por número —sus enunciados no constan en el repositorio— ni las pruebas con
participantes, documentos oficiales, infraestructura o datos reales. Todas las puertas PV
conservan su autoridad y estado `POR VALIDAR`.

I-09 redistribuye y verifica la gestión de estructura por decisión explícita del
responsable del producto: las entidades institucionales y las cuentas permanecen bajo
Administración, mientras la operación académica pertenece a la Coordinación vigente de
cada carrera. ADM-04 refleja la jerarquía Facultad → Carreras y separa campus,
modalidades y periodos en vistas propias, sin modificar el esquema normalizado. Sus filas
permiten editar, archivar y reactivar con autorización y auditoría en servidor. Este cambio
no resuelve ni modifica `PV-16`, que trata la edición excepcional de contenido docente.

I-10 unifica la presentación de listados por decisión explícita del responsable del
producto: el fondo se conserva y las superficies usan tokens diferenciados; ADM-04 se
navega mediante el submenú Estructura académica con rutas propias; toda barra de consulta
ordena búsqueda, filtros y acción; y las 24 superficies tabulares comparten el mismo pie
de paginación. Las acciones operativas de Administrador y Coordinador se agrupan detrás
de un botón accesible de tres puntos sin cambiar autorización ni ciclo de vida. Las 29
páginas operativas y el layout compartido de Configuración usan el mismo encabezado con
icono, título, descripción y espaciado responsive. No cambia el esquema normalizado, el
alcance por rol ni una puerta `PV`.

I-11 alinea el esquema académico con la fuente institucional SIANET a partir del acceso
concedido al respaldo del 23 de junio de 2025. El análisis se hizo sobre datos y no sobre
el DDL. Agrega el nivel `escuelas`, vuelve el periodo dependiente de la carrera, separa la
identidad oculta de la asignatura de su código visible, renombra `nivel` a `ciclo`,
incorpora el desglose de horas y traduce el texto libre de campus y modalidad mediante
`alias_institucionales`, sin copiar los defectos de la fuente. `PV-09` y `PV-10` quedan
`CONFIRMADO` por decisión explícita del responsable del producto; con la identidad
institucional confirmada, la importación ya propone alta, cambio o sin cambio en lugar de
declarar todo conflicto. La importación permanece en modo simulación y `PV-08` y `PV-12`
conservan su autoridad y estado `POR VALIDAR`.

I-12 renombra «contexto» a rol en todo el sistema —clases, props, rutas, vistas, columna
de auditoría, documentación y pruebas— por decisión explícita del responsable del
producto, que reserva la palabra «contexto» para las fuentes académicas que alimentan al
asistente. No cambia autorización, alcance ni ciclo de vida.

I-13 ajusta la experiencia de uso sin tocar autorización ni ciclo de vida: el rol único
se activa solo y el selector queda para quien acumula roles; el panel sustituye los
accesos duplicados por indicadores calculados con el alcance del rol activo; el menú
lateral se vuelve reactivo, despliega sus subopciones y las ofrece en un menú flotante
cuando está reducido; y la superficie visual pasa a tokens de elevación, anillo y sombra
definidos por tema. Corrige tres defectos con prueba de regresión propia.

El trabajo pendiente del proyecto está consolidado en `docs/plans/pending-work.md`, que
separa lo que depende de una revisión manual de lo que espera decisión de la UEB.

I-14 renombra «campaña» a «convocatoria» en todo el sistema —base de datos, clases,
rutas, vistas, auditoría y documentación— por decisión explícita del responsable del
producto. No altera comportamiento.

I-16 completa la edición de mallas, materias, ofertas, paralelos y asignaciones docentes
por decisión explícita del responsable del producto. Coordinación solo modifica registros
de su carrera y cada cambio queda auditado; I-20 reemplaza la inmutabilidad de la malla,
mientras que el historial de sílabos se conserva. Nombre y correo permanecen exclusivamente bajo
Administración: Coordinadores y Docentes no pueden corregirlos, ni siquiera en la cuenta
propia. Este cambio no amplía `PV-16`, que sigue referido al contenido del sílabo.

I-18 incorpora Vue Flow como motor de presentación del constructor de mallas. La
configuración pertenece a la malla actual y admite ciclos, campos tipados, totales,
reubicación y relaciones explícitas; PostgreSQL y los casos de uso Laravel permanecen
como fuente de verdad. La alternativa de formulario mantiene las mismas operaciones y
I-20 permite editarlas sobre el mismo agregado. `PV-08` sigue abierta para las fórmulas
y siglas oficiales: el sistema no las deduce del color o del aspecto del PDF.

I-19 confirma que una persona puede coordinar varias carreras y vuelve explícita la
selección de carrera al iniciar como Coordinador, incluso si solo existe una opción. El
ámbito activo puede cambiarse desde el menú de usuario mediante el mismo caso de uso
auditado. Materias deja de ser una colección independiente en navegación: I-20 abre una
sola Malla directamente y reúne allí el desglose académico y el constructor visual; la
URL anterior de Materias redirige a Malla. No cambia permisos ni elimina historia.

I-20 reemplaza el versionado visible de mallas definido en I-16, I-18 e I-19: la
navegación muestra una sola **Malla** por carrera, sin buscador, filtros, cards,
paginación, publicación ni número de versión. La fila técnica histórica se conserva
solo para mantener referencias existentes; una restricción parcial garantiza una única
malla actual. Coordinación edita la actual activa o inactiva, la deshabilita para
bloquear procesos nuevos y solo puede eliminarla sin dependencias. Cada sílabo fija su
contexto académico y lo incorpora a sus revisiones inmutables.

I-28 (1 de septiembre de 2026) deja el esquema físico y los valores almacenados 100 %
en español por decisión explícita del responsable del producto, en la línea de I-12 e
I-14: timestamps `creado_en`/`actualizado_en`, columnas de `usuarios`
(`correo_electronico`, `contrasena`…), `ejecuciones_trabajo` completa,
`eventos_salientes` (antes `eventos_outbox`), familia `version_bloqueo`, estados y
discriminadores (`pendiente`, `borrador`, `administrador`…), colas Redis y CHECK
constraints; las tablas de framework vivas se renombraron por configuración
(`sesiones`, `trabajos_fallidos`, `restablecimientos_contrasena`, `migraciones`) y las
muertas (`jobs`, `job_batches`, `cache`, `cache_locks`) se eliminaron. Los límites que
quedan (columnas internas de drivers de Laravel, claves internas de JSONB sellados,
contrato del gateway de IA) están registrados en `docs/plans/technical-debt.md`. No
altera autorización ni ciclo de vida; corrige de paso el worker de producción, que no
escuchaba las colas nombradas.

I-29 (2 de septiembre de 2026) elimina la vigencia programada de los roles de cuenta:
`asignaciones_rol` queda efectiva únicamente mientras `activo` sea verdadero y su retiro
es manual. Las vigencias de asignaciones docentes y nombramientos de coordinación no
cambian, pues representan relaciones académicas distintas.

I-31 (2 de septiembre de 2026) traslada el calendario a Administración por decisión
explícita del responsable del producto: `procesos_silabos` fija plantilla, inicio y
entrega para toda la universidad y solo puede haber uno en curso. `convocatorias`
cuelga de un proceso obligatorio, hereda su plantilla y sus fechas y gana el estado
`pausada`. Una convocatoria está en curso solo si ella está abierta y el proceso
también; esa condición habilita el trabajo docente y congela plantilla (proceso),
malla y fuentes (carrera). La prórroga por carrera de I-15 se conserva. No resuelve
`PV-01`: decide cuándo puede cambiarse la plantilla, no quién la aprueba.

I-32 (2 de septiembre de 2026) retira las versiones por decisión explícita del
responsable del producto: `versiones_plantilla` desaparece —secciones, bloques y campos
cuelgan de `plantillas_silabo`, que gana `mapeo_documento`— y `versiones_malla` pasa a
`mallas`, una por carrera, sin `numero_version` ni `es_actual`. Ya no hay «publicar» ni
«crear versión»: la estructura se comprueba al abrir o reanudar el proceso. Regla de
borrado: con la convocatoria pausada, un cambio estructural en la plantilla o en la
malla borra los sílabos en curso de ese alcance previa confirmación con la cifra; los que
ya se enviaron a revisión o tienen análisis de IA no se borran —la base los protege— y en
ese caso el cambio se rechaza. Los sílabos de procesos cerrados no se tocan.

## Propuesto

- PHP 8.3 o superior como mínimo del proyecto.
- UUID generados por la aplicación para claves primarias internas.
- PostgreSQL con `timestamptz` en UTC; presentación en `America/Guayaquil`.
- Laravel Fortify mediante el starter oficial; registro público desactivado si la
  institución administra las cuentas.
- Horizon para observar colas Redis cuando sea útil en el despliegue.
- Estructura `app/Modules/*` con capas ligeras por módulo.
- Outbox transaccional para eventos que deben llegar a trabajos/integraciones.
- Pruebas de arquitectura para evitar dependencias entre módulos no permitidas.

Estas propuestas pueden confirmarse al crear el repositorio. Si cambian, crea un ADR.

## Por validar antes de codificar la parte afectada

Consulta los códigos y puertas en `docs/plans/decisions-pending.md`. Incluyen:

- autoridad institucional que aprueba y firma;
- formato oficial Word/PDF y firmas/sellos;
- matriz final de permisos y edición excepcional del coordinador (`PV-16`);
- frecuencia de actualización de datos institucionales; el origen, el esquema y la
  calidad quedaron confirmados en I-11;
- SSO, registro público y ciclo de vida de cuentas;
- infraestructura, almacenamiento, copias, retención y recuperación;
- motor/modelo local de IA, umbrales y hardware;
- corpus autorizado, tratamiento de datos y criterios de aceptación;
- resultados de entrevistas a docentes, coordinación y personal técnico.

## Trabajo permitido mientras se valida

- bootstrap reproducible y CI;
- estructura modular y convenciones;
- autenticación base sin fijar SSO;
- modelo de roles configurable;
- prototipos y componentes compartidos;
- migraciones de entidades ya confirmadas;
- estados y revisión inmutable confirmados;
- pruebas unitarias de invariantes confirmadas;
- adaptadores con interfaces y dobles de prueba;
- documentación, trazabilidad y planes.

No programes como irreversible una decisión institucional que sigue abierta.
