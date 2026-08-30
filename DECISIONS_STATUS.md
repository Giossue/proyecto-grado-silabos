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
- Plantillas y fuentes publicadas son inmutables y versionadas.
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
- Cada versión de malla puede variar en ciclos y campos. El documento de Software es una
  referencia visual, no una plantilla universal; Coordinación dispone de constructor y
  formulario sobre la misma información.

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
de su carrera y cada cambio queda auditado; la inmutabilidad de mallas publicadas y del
historial de sílabos se conserva. Nombre y correo permanecen exclusivamente bajo
Administración: Coordinadores y Docentes no pueden corregirlos, ni siquiera en la cuenta
propia. Este cambio no amplía `PV-16`, que sigue referido al contenido del sílabo.

I-18 incorpora Vue Flow como motor de presentación del constructor de mallas. La
configuración pertenece a cada versión y admite ciclos, campos tipados, totales,
reubicación y relaciones explícitas; PostgreSQL y los casos de uso Laravel permanecen
como fuente de verdad. La alternativa de formulario mantiene las mismas operaciones y
las versiones publicadas continúan inmutables. `PV-08` sigue abierta para las fórmulas y
siglas oficiales: el sistema no las deduce del color o del aspecto del PDF.

I-19 confirma que una persona puede coordinar varias carreras y vuelve explícita la
selección de carrera al iniciar como Coordinador, incluso si solo existe una opción. El
ámbito activo puede cambiarse desde el menú de usuario mediante el mismo caso de uso
auditado. Materias deja de ser una colección independiente en navegación: las mallas se
presentan como cards y cada detalle reúne el desglose académico y el constructor visual;
la URL anterior de Materias redirige a Mallas. No cambia permisos ni elimina historia.

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
