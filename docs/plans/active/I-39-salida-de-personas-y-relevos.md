# I-39: Salida de personas: reemplazo de coordinación, relevo docente y archivo seguro

## Estado

Implementado el 2026-09-03 de madrugada por encargo del responsable del producto
(«analiza todos los casos y hazlo»). Resuelve `PV-21`. Verificación al pie.

## Punto de partida

Nada del sistema pertenece a una persona: malla, ofertas, paralelos y convocatorias son
de la carrera; borradores y revisiones, del sílabo. Las personas tienen **vigencias**:
rol por carrera (`asignaciones_rol`), nombramiento de coordinación
(`asignaciones_coordinador`, uno vigente por carrera) y asignación docente por paralelo
(`asignaciones_docente`), que a su vez sostiene la colaboración en un sílabo
(`colaboradores_silabo`). Salir es cerrar vigencias y, si no queda ninguna, cerrar la
cuenta. La historia (revisiones, aprobaciones, auditoría) no se toca ni se reasigna.

## Casos analizados

| # | Quién sale | Qué tiene | Qué debe pasar |
|---|---|---|---|
| 1 | Docente | Sin asignaciones vigentes | Archivar la cuenta. |
| 2 | Docente | Paralelos asignados, sin sílabos en curso | Archivar cierra sus asignaciones; Coordinación asigna después a otro. |
| 3 | Docente | Sílabos en curso (borrador, en revisión, corrección) en convocatoria abierta | **No se archiva** hasta relevarlo. «Relevar docente» mueve todos sus paralelos y sílabos al entrante de una vez. |
| 4 | Docente | Un sílabo en revisión | El relevo no toca ese sílabo (la revisión tiene interlocutor); se rechaza el relevo global hasta resolverla, nombrando la materia. |
| 5 | Coordinador de una carrera | Solo coordina | «Reemplazar coordinador»: cierra su nombramiento y su rol en esa carrera, abre los del entrante (le concede el rol si no lo tiene), y archiva la cuenta si ya no le queda ningún rol vigente. |
| 6 | Coordinador de varias carreras | Deja una | Reemplazo por carrera; la cuenta sigue activa con las otras. |
| 7 | Docente que también coordina (lo habitual) | Deja solo la coordinación | Reemplazo sin archivar: sigue como docente. |
| 8 | Docente que también coordina | Se va del todo | Reemplazo (por Admin) y relevo docente (por el nuevo coordinador); el archivo se bloquea mientras tenga sílabos en curso. |
| 9 | Coordinador entrante que ya es docente | — | Conserva ambos roles; cambia de ámbito con el selector de rol. |
| 10 | Coordinador entrante sin cuenta | — | Admin crea la cuenta primero (ADM-02) y luego reemplaza; la cuenta pendiente de activación es válida. |
| 11 | Administrador | Es el único | No se archiva: siempre debe quedar una administración. Tampoco se archiva a sí mismo (ya existía). |
| 12 | Coordinación sin titular (nunca hubo o se archivó) | — | «Asignar coordinador» desde la misma acción; el paso de puesta en marcha lo cuenta. |
| 13 | Cuenta que nadie estrenó | Sin rastro | Se elimina (I-38); con rastro, se archiva. |
| 14 | Reutilizar una cuenta cambiando nombre y correo | — | Prohibido como práctica: la auditoría es personal. El sistema solo permite corregir; el reemplazo de personas se hace con estas acciones. |

## Diseño

- **`ReplaceCoordinator`** (Academic/Application/Actions; `POST
  admin/gobierno-academico/carreras/{career}/coordinador`, `ReplaceCoordinatorRequest`):
  en una transacción cierra el nombramiento vigente (`vigente_hasta = ahora`,
  `activo = false`) y desactiva el rol de coordinador del saliente en esa carrera;
  concede el rol al entrante si no lo tiene (`AssignRole`) y abre su nombramiento
  (`CoordinationMandate::open`). Con `archive_outgoing` y sin más roles vigentes, archiva
  al saliente (`SetUserStatus`, que ya cierra sesiones). Rechaza entrante = saliente y
  entrante inactivo. Audita `academico.coordinacion.reemplazada` con ambos ids y lo que
  se hizo. La tabla de Carreras muestra la coordinación vigente y la acción se llama
  «Asignar coordinador» cuando no hay nadie.
- **`RelieveTeacher`** (Syllabus/Application/Actions; `POST
  coordinacion/estructura-academica/docentes/relevar`, `RelieveTeacherRequest`): para
  la carrera activa, toma todas las asignaciones vigentes del saliente sobre paralelos de
  la carrera. Las que sostienen un sílabo pasan por `TransferSyllabusTeacher` (mismas
  reglas por estado: aprobado se reabre, corrección se conserva, borrador se descarta con
  aviso, en revisión se rechaza); las que no tienen sílabo se cierran y se abren para el
  entrante con el mismo sustento documental. Todo o nada: si un sílabo está en revisión,
  no se releva ninguno y el mensaje nombra la materia. Audita
  `docente.relevo_global` con conteos.
- **Archivo seguro** (`SetUserStatus`): al desactivar, rechaza si (a) es el único
  administrador activo, o (b) colabora en sílabos en curso (`borrador`, `en_revision`,
  `correccion_solicitada`) de convocatorias abiertas, diciendo cuántos y en qué carreras.
  Si pasa, además de sesiones y nombramientos, cierra sus asignaciones docentes vigentes
  para que ningún paralelo quede a nombre de alguien que ya no está.

## Verificación

`CoordinatorReplacementTest`, `TeacherReliefTest`, `ManagedUserTest` (archivo bloqueado,
cierre de asignaciones, último administrador); suite completa, phpstan, eslint, vue-tsc y
build.
