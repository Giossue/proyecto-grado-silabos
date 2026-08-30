# I-09: Gobierno institucional y gestión académica por carrera

## Estado

Implementación y verificación automatizada concluidas el 2026-08-14 por decisión
explícita del responsable del producto. La comprobación manual de accesibilidad y
dispositivos continúa centralizada en I-08.

La separación histórica de Mallas y Materias en rutas propias fue reemplazada por I-19:
Materias ahora se gestiona dentro del detalle de la malla y la URL anterior redirige.

## Trazabilidad

- RF-003 a RF-016; RN-001 a RN-008; CU-02 y CU-03.
- ADM-01 a ADM-04; COR-01, COR-13, COR-14 y COR-15.
- CP-F de identidad, alcance, estructura, asignaciones e historial.
- `PV-16` no aplica: este cambio permite gestionar estructura académica, no editar el
  contenido de un sílabo en nombre del docente.

## Decisión confirmada

- El Administrador crea y mantiene facultades, carreras, campus, modalidades y periodos
  académicos; crea cuentas con rol y vigencia y asigna coordinaciones a carreras.
- ADM-04 muestra la jerarquía Facultad → Carreras. Campus, modalidades y periodos se
  mantienen como catálogos independientes y se presentan en tablas separadas; no se crea
  una tabla genérica ni una relación campus-facultad no confirmada.
- Cada catálogo de ADM-04 admite edición de metadatos, archivo y reactivación. Reasignar
  una carrera exige una facultad activa y toda edición conserva antes/después en auditoría.
- Coordinador y Docente siguen siendo usuarios con roles y asignaciones, no catálogos de
  personas duplicados.
- El Coordinador, desde un rol explícito, gestiona únicamente su carrera: mallas en
  borrador, materias, ofertas, paralelos y asignaciones docentes.
- Un rol de Coordinador solo es seleccionable mientras coincidan un rol y una
  asignación de coordinación vigentes para la misma carrera.
- El Coordinador puede publicar una malla de su carrera; una vez publicada permanece
  inmutable.
- El Coordinador solo puede asignar una cuenta con rol Docente vigente en esa misma
  carrera y a un paralelo perteneciente a ella.
- El Administrador no obtiene permisos académicos del Coordinador de forma implícita.
- En lenguaje visible, la posición de una materia en la malla se denomina **ciclo**. El
  **periodo académico** conserva su significado temporal y sus fechas.

## Resultado demostrable

El menú administrativo separa usuarios, estructura académica y coordinaciones. El menú de
Coordinador agrupa Mallas/Materias y Ofertas/Paralelos en submenús con rutas propias,
además de la asignación docente. Toda consulta
y mutación de coordinación se limita en PostgreSQL a la carrera del rol activo,
incluidos identificadores enviados manualmente fuera de la interfaz. Cada pantalla de
listado mantiene un único botón principal y despliega su formulario en un panel lateral
derecho. I-10 reemplaza las pestañas de ADM-04 por rutas hijas del sidebar: Carreras
explicita su Facultad y los catálogos independientes conservan tablas propias. Cada
registro ofrece Editar y Archivar/Reactivar sin exponer borrado físico.

## Pasos

- [x] Registrar la decisión de producto y los IDs afectados.
- [x] Separar autorización de gobierno global y gestión académica por carrera.
- [x] Aplicar alcance por carrera a consultas, creación, publicación y archivo.
- [x] Reorganizar rutas, navegación y pantallas con componentes compartidos.
- [x] Separar Mallas, Materias, Ofertas y Paralelos en rutas hijas del sidebar.
- [x] Evitar encabezados duplicados entre las páginas y sus tablas académicas.
- [x] Usar “ciclo” en materias sin confundirlo con periodo académico.
- [x] Cubrir permisos, alcance lateral, auditoría e invariantes con pruebas PostgreSQL.
- [x] Sustituir la tabla plana de ADM-04 por Facultad → Carreras y catálogos separados.
- [x] Verificar la clave foránea de carrera y la independencia estructural de campus.
- [x] Implementar edición transaccional de los cinco catálogos con valores auditados.
- [x] Incorporar acciones Editar, Archivar y Reactivar en cada registro de ADM-04.
- [x] Probar permisos, unicidad, fechas, reasignación de facultad y ciclo de vida.
- [x] Actualizar trazabilidad, guía de demostración y evidencia de verificación.

## Evidencia

- `AcademicStructureTest` y `CoordinatorAssignmentConstraintTest`: 18 pruebas y 182
  aserciones sobre separación de roles, alcance lateral, ciclo, publicación, oferta,
  asignaciones, auditoría y restricciones PostgreSQL.
- `ActiveRoleTest` comprueba además que una coordinación vencida o inactiva invalida la
  selección y el uso del rol Coordinador.
- `composer verify`: 144 pruebas y 1.537 aserciones; escaneo de secretos, ESLint,
  Prettier, TypeScript, Pint, Larastan nivel 7 y build Vite aprobados el 2026-08-14.
- La guía `docs/runbooks/demo.md` separa el recorrido del Administrador, Coordinador y
  Docente y usa ciclo para la posición curricular.
- ADM-04 y COR-13..15 reutilizan `Sheet`, `Field`, `Select` y `Button` compartidos; los
  formularios permanecen ocultos hasta que la persona activa la acción principal.
- `ManagementCreationUiTest` protege que ADM-04 mantenga `faculty_id`, use rutas y
  submenús, no vuelva a construir una colección plana y conserve edición/ciclo de vida.
  I-10 amplía esa suite con filtros, superficies y paginación común.

## Riesgos y reversión

- No se crean entidades nuevas para Coordinador o Docente; se conservan usuarios, roles y
  asignaciones históricas existentes.
- No se modifica la migración aplicada: `facultades`, `carreras` y `campus` ya están
  separadas; `carreras.facultad_id` y las claves de `ofertas_academicas` expresan las
  relaciones normalizadas.
- La edición no equivale a borrado ni a reescritura de evidencia académica: actualiza
  metadatos administrativos y añade un evento de auditoría inmutable.
- No se renombra la columna histórica `nivel`; el contrato y la interfaz traducen ese
  valor a `ciclo` para evitar una migración destructiva innecesaria.
- Las rutas administrativas anteriores se reemplazan solo cuando su nueva frontera tenga
  pruebas de autorización equivalentes o superiores.
- Un ID de otra carrera debe resolverse como recurso no disponible y nunca revelar datos
  laterales.
