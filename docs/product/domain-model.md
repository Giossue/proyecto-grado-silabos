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

### Estructura académica

- `Facultad`, `Escuela`, `Carrera`, `Campus`, `Modalidad`, `PeriodoAcademico`.
- `VersionMalla`, `Asignatura` con ciclo curricular y `RequisitoAsignatura`.
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
de una carrera. El Coordinador mantiene mallas, asignaturas, ofertas, paralelos y
asignaciones docentes solo dentro de esa carrera. Un periodo académico representa fechas;
el ciclo representa la posición de una materia dentro de la malla.

### Configuración

- `PlantillaSilabo` agrupa versiones.
- `VersionPlantilla` contiene secciones, bloques y definiciones de campo.
- `FuenteAcademica` agrupa versiones.
- `VersionFuente` contiene datos estructurados o narrativa segura.
- `FragmentoFuente` permite recuperar evidencia exacta.

Publicar una versión la vuelve inmutable. Un sílabo conserva la versión con la que fue
creado.

### Convocatoria

`Convocatoria` vincula carrera, periodo, plantilla publicada, fuentes activas, asignaciones,
fechas y estado. Antes de abrirla se resuelven conflictos críticos de configuración.

### Sílabo

`Silabo` identifica el expediente canónico por asignatura, periodo y versión de malla.
Puede agrupar docentes/paralelos compatibles o registrar una excepción justificada.

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
4. Publicado/enviado/aprobado significa inmutable.
5. Todo envío o reenvío inserta una revisión; nunca actualiza la anterior.
6. Una aprobación apunta a una revisión concreta.
7. Una reapertura no altera la aprobación previa.
8. La comparación solo usa revisiones del mismo expediente autorizado.
9. Una recomendación solo cita fuentes activas y vigentes para esa convocatoria.
10. Un conflicto entre fuentes exactas exige resolución humana explícita.
11. Word y PDF se generan desde la misma revisión y versión de plantilla.
12. Redis y el servicio de IA pueden fallar sin corromper el expediente.

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
