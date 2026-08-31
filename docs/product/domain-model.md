# Modelo de dominio

## Ámbitos y agregados

### Identidad y alcance

- `Usuario`: persona autenticable, activa o inactiva.
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

`Campus` y `Modalidad` son catálogos institucionales independientes. La relación con un
campus y una modalidad ocurre en `OfertaAcademica`, junto con la asignatura y el periodo,
por lo que no se duplican esos valores dentro de facultades o carreras.

`PeriodoAcademico` no es un catálogo global: pertenece a una carrera. En la fuente el
mismo nombre de periodo existe una vez por carrera con fechas propias, así que el código
de periodo es único dentro de su carrera y no en toda la institución.

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
son historia técnica y no se exponen como versiones al usuario.

### Configuración

- `PlantillaSilabo` agrupa versiones.
- `VersionPlantilla` contiene secciones, bloques y definiciones de campo.
- `FuenteAcademica` agrupa versiones.
- `VersionFuente` contiene datos estructurados o narrativa segura.
- `FragmentoFuente` permite recuperar evidencia exacta.

Publicar una versión de plantilla o fuente la vuelve inmutable. Un sílabo conserva las
versiones de configuración y el contexto académico con los que fue creado.

### Convocatoria

`Convocatoria` vincula carrera, periodo, plantilla publicada, fuentes activas, asignaciones,
fechas y estado. Antes de abrirla se resuelven conflictos críticos de configuración.

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
- `EvidenciaRecomendacion`: fuente, versión y fragmento.
- `RetroalimentacionIA`: aceptar, ignorar o no útil; la aplicación explícita es humana.

No mezcles ambos subsistemas. Una validación puede bloquear si una regla aprobada lo
establece; una recomendación de IA nunca bloquea por sí sola.

### Operación

- `ObjetoAlmacenado` y `ArtefactoExportacion`.
- `Notificacion`, `EventoAuditoria`, `EventoOutbox`, `EjecucionTrabajo`.

## Invariantes

1. Cada acción protegida exige usuario activo y permiso efectivo sobre el recurso.
2. No se crean dos coordinaciones activas superpuestas para una misma carrera.
3. Solo una plantilla publicada y vigente crea nuevos sílabos en una convocatoria.
4. Una plantilla o fuente publicada y una revisión enviada/aprobada son inmutables.
5. Todo envío o reenvío inserta una revisión; nunca actualiza la anterior.
6. Una aprobación apunta a una revisión concreta.
7. Una reapertura no altera la aprobación previa.
8. La comparación solo usa revisiones del mismo expediente autorizado.
9. Una recomendación solo cita fuentes activas y vigentes para esa convocatoria.
10. Un conflicto entre fuentes exactas exige resolución humana explícita.
11. Word y PDF se generan desde la misma revisión y versión de plantilla.
12. Redis y el servicio de IA pueden fallar sin corromper el expediente.
13. Cada carrera tiene como máximo una malla actual; su estado es activa o inactiva y
    ambos admiten edición por Coordinación.
14. Una materia, un campo o una relación de malla siempre pertenece a una única carrera
    por medio de la malla.
15. Crear ofertas y abrir procesos exige que la malla actual esté activa.
16. Todo sílabo y toda revisión conservan el contexto académico fijado al crearse.
17. Las horas totales de una materia se derivan de sus componentes horarios activos y no
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
