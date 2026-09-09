# I-62: Programación de asignaturas y paralelos

## Estado

Implementación y migración local verificadas el 2026-09-09. El despliegue compatible y
la migración remota permanecen pendientes.

## Problema

El producto llama «oferta académica» a la programación interna de una asignatura en un
período. En el vocabulario oficial del sistema de educación superior, la oferta académica
está formada por las carreras y programas aprobados por el CES y registrados en el
SNIESE. Una materia, su período y sus paralelos corresponden a la planificación académica
interna de la IES.

Mantener ambos significados confunde la pantalla de Coordinación y presenta una entidad
operativa como si fuera la carrera o programa autorizado.

Fuentes de contraste:

- SENESCYT, «Oferta académica UEP-ISTT»:
  <https://siau.senescyt.gob.ec/oferta-academica-uep-istt/>.
- CES, «Sistema visualizador de la oferta académica vigente»:
  <https://appcmi.ces.gob.ec/oferta_vigente/manual_usuario_oferta_vigente/>.
- UEB, «Distributivo Académico PAO I, abril-julio 2024»:
  <https://rdigital.ueb.edu.ec/items/59cdab38-8166-453f-a91d-bf57cc38cd71>.

## Trazabilidad

RF-007..016, RN-005..008, CU-03, COR-14..15 y CP-F estructura académica. No depende de
una puerta `PV`: corrige vocabulario y nombres técnicos sin cambiar permisos, estados,
cardinalidades ni criterios de aceptación.

## Decisión

- «Oferta académica» queda reservado para carreras y programas aprobados y registrados.
- La entidad que relaciona una asignatura con un período, campus y modalidad se denomina
  **programación de asignatura**.
- La pantalla de Coordinación se denomina **Materias y paralelos** y su acción principal
  continúa siendo **Preparar período**.
- Una programación de asignatura contiene uno o más paralelos. Cada paralelo conserva su
  jornada y su asignación docente, y cada uno genera su propio sílabo.
- «Distributivo académico» describe el conjunto de programaciones, paralelos y
  asignaciones docentes; no reemplaza el nombre de una asignación individual.
- Las clases y rutas siguen en inglés, conforme al precedente I-14/I-28; el esquema y los
  valores persistidos permanecen en español.

## Implementación

1. Renombrar el modelo `CourseOffering` a `ScheduledSubject`, sus relaciones y acciones.
2. Incorporar una migración nueva que renombre `ofertas_academicas` a
   `programaciones_asignatura` y `oferta_academica_id` a
   `programacion_asignatura_id`, preservando UUID, filas, claves e historia.
3. Renombrar rutas, datos Inertia, componentes y mensajes visibles a materias,
   programaciones y paralelos.
4. Mantener redirección desde `/coordinacion/ofertas` hacia la ruta canónica para enlaces
   guardados; los nombres internos anteriores dejan de ser API pública.
5. Actualizar decisiones, arquitectura, especificación, identificación institucional y
   matriz de trazabilidad.
6. Ajustar pruebas de estructura, sílabos, interfaz y esquema español, incluida la
   lectura compatible de fotografías históricas.

## Migración y recuperación

La migración es estructural: no transforma ni elimina datos. Antes y después se comparan
los conteos de `programaciones_asignatura`, `paralelos` y `alcances_silabo`, se verifican
las claves foráneas y se ejecuta la puerta canónica sobre PostgreSQL.

El `down` renombra columnas y tabla a sus identificadores anteriores. En producción se
prefiere un forward-fix; la reversión solo es segura junto con el artefacto anterior.
La base remota se migra mediante el procedimiento con `.pgpass`, bloqueo aislado y
estado antes/después descrito en `docs/security/hardening.md`, una vez que el artefacto
compatible esté desplegado.

## Evidencia de verificación

- `composer verify`: 399 pruebas y 5.929 aserciones; escaneo de secretos, ESLint,
  Prettier, TypeScript, Pint, PHPStan y build de producción aprobados.
- Pruebas focalizadas iniciales: 79 pruebas y 986 aserciones sobre estructura
  académica, convocatorias, relevo, identificación, esquema y planificación.
- Base local: migraciones `000051` y `000052` aplicadas; 1 programación, 1 paralelo,
  0 alcances y 0 relaciones huérfanas después del cambio.
- Prevalidación remota de solo lectura: 42 programaciones, 43 paralelos, 0 alcances y
  0 duplicados por período/materia. Las migraciones `000051` y `000052` siguen
  pendientes hasta desplegar el artefacto compatible.
