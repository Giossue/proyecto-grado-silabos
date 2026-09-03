# Modelo de dominio

## Ámbitos y agregados

### Identidad y alcance

- `Usuario`: persona autenticable, activa o inactiva. Su nombre se guarda normalizado
  (I-32): mayúsculas con tildes, primero nombres y luego apellidos, sin espacios
  sobrantes; `PersonName::normalize` lo aplica en toda escritura.
- `Rol`: Administrador, Coordinador o Docente.
- `AsignacionRol`: rol, alcance y vigencia; una persona puede tener varias.
- `AsignacionCoordinador` y `AsignacionDocente`: vinculan responsabilidad académica.
  Ambas guardan la referencia del acto que las respalda —tipo, número y fecha—. La
  coordinación distingue además titular de encargado; un encargo exige fecha de fin, que
  la base impone, porque sin ella sería una titularidad sin nombrar. Las atribuciones del
  encargado son las mismas que las del titular.

Una persona puede coordinar más de una carrera mediante asignaciones independientes. La
sesión conserva una sola `AsignacionRol` activa: Coordinación siempre confirma la carrera
al entrar y puede sustituirla desde el menú, sin sumar alcances ni privilegios.

### Estructura académica

- `Facultad`, `Escuela`, `Carrera`, `Campus`, `Modalidad`, `PeriodoAcademico`.
- `Malla` —persistida internamente en `VersionMalla`—, `DefinicionCampoMalla`, `Asignatura` con ciclo/orden,
  `ValorCampoAsignatura` y `RequisitoAsignatura`.
- `OfertaAcademica`, `Paralelo`, `AsignacionDocente`.
- `AliasInstitucional` traduce el texto libre de la fuente hacia un catálogo normalizado.

Una `Facultad` agrupa muchas `Escuela` y cada `Escuela` agrupa muchas `Carrera`, como en
la fuente institucional. Una carrera solo puede colgar de una escuela de su propia
facultad, y la base lo impone con una clave ajena compuesta, no con validación de
aplicación.

`Campus` es catálogo; la modalidad no: son los valores fijos del Reglamento de Régimen
Académico (`StudyModality`). La oferta no elige ninguno de los dos: hereda el campus de
la carrera (`carreras.campus_id`, I-36) y la modalidad de la materia si se apartó
(`asignaturas.modalidad`) o de la base de la carrera (`carreras.modalidad`, I-35, I-37).
Si alguna materia se aparta, la carrera es híbrida sin marcarlo. La oferta conserva las
copias porque el sílabo toma de ahí campus y modalidad.

`PeriodoAcademico` es un catálogo institucional único: su código no se repite entre
carreras. Aunque la fuente histórica lo replique por carrera, el producto lo consolida
como la ventana temporal común de la universidad (I-41).

Una `Asignatura` tiene dos identificadores institucionales con papeles distintos: el
código oculto es la identidad canónica con la que se reconcilia, y el código visible es
el que leen las personas. Solo el primero identifica.

Las relaciones históricas se archivan o desactivan; no se eliminan si ya respaldan un
sílabo.

El Administrador gobierna las entidades institucionales globales y asigna la coordinación
de una carrera. El Coordinador mantiene la malla, asignaturas, ofertas, paralelos y
asignaciones docentes solo dentro de esa carrera. Un periodo académico representa fechas;
el ciclo representa la posición de una materia dentro de la malla.

Cada carrera tiene cero o una sola malla actual. La malla define su cantidad de ciclos y
composición de tarjeta. Sus campos tienen clave estable, etiqueta, tipo, posición,
visibilidad y capacidad de
totalización; pueden proyectar un dato estructurado existente o conservar un valor
adicional tipado por asignatura. Retirar un campo lo desactiva sin borrar sus valores.
En cada materia, los campos activos son obligatorios. Las horas totales se derivan de la
suma de los componentes horarios activos y nunca incluyen los créditos; el servidor
recalcula este valor en cada alta o edición. Si el desglose no envía una posición, la
materia se agrega después de la última del mismo ciclo.
Una relación académica guarda origen, destino y tipo; el color del diagrama no constituye
la regla. El desglose académico y el constructor visual son dos proyecciones del mismo
agregado; las asignaturas se mantienen dentro de la malla y no como una
colección de navegación independiente. La malla actual se edita sobre sí misma tanto
activa como inactiva. Deshabilitarla bloquea ofertas y procesos nuevos; eliminarla solo
es posible cuando no tiene ofertas ni sílabos. Las filas anteriores de `VersionMalla`
ya no existen: `mallas` tiene una fila por carrera (I-32).

### Configuración

- `PlantillaSilabo` institucional única, sin versiones (I-32): contiene directamente
  secciones, bloques, definiciones de campo y el mapa de exportación. Se edita en el
  sitio.
- `FuenteAcademica` es un documento de la Coordinación de la carrera: nombre,
  descripción, notas internas y contenido Markdown editable. No tiene versiones ni
  fragmentos; la evidencia de IA conserva su propia fotografía del contenido.

No hay publicación: la estructura se comprueba al abrir o reanudar el proceso. Un sílabo
sin enviar lee la plantilla en vivo; una revisión enviada conserva su copia completa y ya
no depende de ella. Si la plantilla o la malla cambian con la convocatoria pausada, los
sílabos en curso sin enviar se borran previa confirmación; los ya enviados o con análisis
de IA no se borran y el cambio se rechaza.

### Proceso de sílabos y convocatoria

`ProcesoSilabos` es el calendario institucional: nombre, período académico, plantilla
institucional, fecha de inicio, fecha de entrega y estado (`preparacion`, `abierto`, `pausado`,
`cerrado`). Lo administra Administración porque el calendario académico oficial obliga
a todas las facultades. La base impone un solo proceso abierto o pausado a la vez.

`Convocatoria` cuelga de un proceso obligatorio y vincula carrera, período heredado del
proceso, fuentes
activas, agrupación, fechas y estado (`preparacion`, `abierta`, `pausada`, `cerrada`).
Hereda la plantilla, el período y las fechas del proceso al prepararse; las fechas se
copian, no se referencian, porque la carrera puede prorrogar las suyas. Solo se abre con el proceso
abierto; al abrirla, la plantilla debe estar completa y las fuentes activas.

Una convocatoria está **en curso** cuando ella está abierta y su proceso también. Esa
condición habilita a los docentes y, por lo mismo, congela lo que sostiene su trabajo:
con el proceso abierto no se edita ni publica la plantilla; con una convocatoria en
curso no se editan la malla ni las fuentes de esa carrera. Ofertas, paralelos y
asignaciones docentes siguen editables, porque el relevo docente los necesita. Para
corregir se pausa: Administración el proceso —detiene a toda la universidad—,
Coordinación su convocatoria —solo su carrera—. Los expedientes ya creados conservan
la plantilla con la que nacieron; cambiar la del proceso solo alcanza a las
convocatorias que se abran después.

### Sílabo

`Silabo` identifica el expediente canónico por asignatura, periodo y malla. Fija en
`contexto_academico` una fotografía de la malla, materia y oferta al momento de crearse,
por lo que cambios posteriores no reescriben el expediente. Puede agrupar
docentes/paralelos compatibles o registrar una excepción justificada.

`RevisionSilabo` es una fotografía inmutable del contenido enviado. El borrador actual
puede editarse con control de concurrencia; cada envío crea otra revisión.

El contenido dinámico usa definiciones de campo más valores y filas repetibles, no DDL
por plantilla:

- `ValorCampo` para valores escalares/estructurados;
- `FilaRepetible` para listas y tablas;
- referencias explícitas a `DefinicionCampo` y `VersionPlantilla`.

### Revisión

- `Observacion`: campo, sección o documento; autor, revisión, estado y fecha.
- `RespuestaObservacion`: respuesta del docente.
- `Aprobacion`: actor, revisión, fecha, metadatos y huella.
- `Reapertura`: causa, actor, revisión aprobada de origen y nueva revisión.

### Validación e IA

- `EjecucionValidacion` y `ResultadoValidacion`: reglas determinísticas reproducibles.
- `EjecucionIA`: entrada/huella, modelo, parámetros, estado y tiempos.
- `RecomendacionIA`: sugerencia informativa.
- `EvidenciaRecomendacion`: fuente citada con extracto y huella del contenido.
- `RetroalimentacionIA`: aceptar, ignorar o no útil; la aplicación explícita es humana.

No mezcles ambos subsistemas. Una validación puede bloquear si una regla aprobada lo
establece; una recomendación de IA nunca bloquea por sí sola.

### Operación

- `ObjetoAlmacenado` y `ArtefactoExportacion`.
- `Notificacion`, `EventoAuditoria`, `EventoOutbox`, `EjecucionTrabajo`.

## Invariantes

1. Cada acción protegida exige usuario activo y permiso efectivo sobre el recurso.
2. No se crean dos coordinaciones activas superpuestas para una misma carrera.
3. La única plantilla institucional activa crea nuevos sílabos en una convocatoria de cualquier carrera.
4. Una revisión enviada/aprobada es inmutable y contiene su propia copia de la plantilla.
5. Todo envío o reenvío inserta una revisión; nunca actualiza la anterior.
6. Una aprobación apunta a una revisión concreta.
7. Una reapertura no altera la aprobación previa.
8. La comparación solo usa revisiones del mismo expediente autorizado.
9. Una recomendación solo cita fuentes activas fijadas por esa convocatoria, y su
   evidencia es una fotografía inmutable del contenido citado.
10. Word y PDF se generan desde la copia que guarda la propia revisión.
11. Redis y el servicio de IA pueden fallar sin corromper el expediente.
12. Cada carrera tiene como máximo una malla actual; su estado es activa o inactiva y
    ambos admiten edición por Coordinación.
13. Una materia, un campo o una relación de malla siempre pertenece a una única carrera
    por medio de la malla.
14. Crear ofertas y abrir procesos exige que la malla actual esté activa.
15. Todo sílabo y toda revisión conservan el contexto académico fijado al crearse.
16. Las horas totales de una materia se derivan de sus componentes horarios activos y no
    de un valor ingresado manualmente.

## Tipos de campo de plantilla

- grupo/sección;
- texto corto;
- texto largo o Markdown seguro;
- número;
- fecha;
- selección única o múltiple;
- booleano;
- lista o tabla repetible;
- cálculo;
- referencia a maestro;
- campo condicional.

Cada definición tiene clave estable, etiqueta, ayuda, tipo, obligatoriedad, visibilidad,
origen, permisos, reglas, posición y habilitación de IA.

La cobertura funcional de las doce secciones se detalla en `syllabus-sections.md`.

## Datos estructurados frente a narrativa

Códigos, horas, créditos, resultados, habilidades, TIC/TAC/IA y bibliografía se guardan
de forma estructurada cuando requieran cálculo, validación o referencia. Markdown seguro
se reserva para narrativa. Nunca se extrae un dato exacto desde texto libre si existe una
fuente estructurada.
