# I-31: Calendario institucional de sílabos y pausas por alcance

## Estado

Implementado y verificado el 2026-09-02. La migración remota ya se ejecutó; queda
pendiente desplegar el artefacto de aplicación para que ADM-12 y las pausas existan en
producción.

## Trazabilidad

- RF-017..026 (plantilla), RF-027..033 (fuentes), RF-034..036 (convocatorias),
  RF-008..016 (malla); RN-009..019; CU-03..06; ADM-05..07, COR-02..04, COR-11, COR-13.
- Decisión explícita del responsable del producto (2026-09-02): el calendario académico
  oficial obliga a toda la universidad, así que Administración abre el proceso de
  elaboración de sílabos; Coordinación convoca a su carrera dentro de ese proceso.
- No depende de una decisión `POR VALIDAR`. `PV-01` (autoridad de la plantilla) sigue
  abierta: aquí solo se decide **cuándo** puede cambiarse, no quién la aprueba.

## Resultado demostrable

- Administración crea un **proceso de sílabos** con plantilla publicada, fecha de inicio
  y fecha de entrega, y lo abre, pausa, reanuda o cierra. Solo puede haber un proceso en
  curso (abierto o pausado) a la vez.
- Coordinación prepara su convocatoria eligiendo el proceso: la plantilla y las fechas se
  heredan; solo decide periodo, agrupación y fuentes. Solo puede abrirla si el proceso está
  abierto. Puede pausar y reanudar su convocatoria con motivo.
- Con el proceso abierto, la plantilla no se edita ni se publica: hay que pausar el proceso.
- Con una convocatoria en curso (abierta y proceso abierto), la malla y las fuentes de la
  carrera no se editan: hay que pausar la convocatoria de esa carrera, no las demás.
- Docentes de una convocatoria pausada —por la carrera o por la universidad— no editan
  ni envían mientras dure la pausa; sus borradores se conservan.

## Decisiones y alcance

- `procesos_silabos` es el agregado institucional; `convocatorias.proceso_id` es
  obligatorio. Las convocatorias existentes reciben un proceso derivado de su propia
  plantilla y fechas en la migración.
- Estados del proceso: `preparacion → abierto ⇄ pausado → cerrado`. Estados de la
  convocatoria: `preparacion → abierta ⇄ pausada`, `cerrada` se conserva.
- «En curso» = convocatoria `abierta` **y** proceso `abierto`. Es la única condición que
  bloquea ediciones y habilita el trabajo docente.
- La pausa del administrador congela toda la universidad; la del coordinador, su carrera.
- Las fechas de la convocatoria siguen viviendo en `fechas_limite_convocatoria` (I-15) y
  se copian del proceso al prepararla; la prórroga por carrera se mantiene.
- Ofertas, paralelos y asignaciones docentes no se bloquean: no fueron pedidos y el
  relevo docente (I-15) los necesita en plena convocatoria.
- Los expedientes ya creados conservan su plantilla: cambiar la plantilla del proceso solo
  afecta convocatorias que se abran después.

## Cambios previstos

- Datos: migración `000027` con `procesos_silabos`, `convocatorias.proceso_id`, estado
  `pausada` y relleno de datos existentes.
- Sílabos: modelo `SyllabusProcess`, acciones de proceso, pausa/reanudación de
  convocatoria, `ProcessLocks`, política y controlador administrativo.
- Configuración y Académico: cada mutación de plantilla, malla o fuente consulta
  `ProcessLocks` y rechaza con mensaje claro.
- Frontend: ADM «Convocatorias» (`admin/convocatorias`, proceso institucional), COR-03 hereda plantilla y fechas, COR-04 pausa y
  reanuda, avisos de bloqueo en malla, fuentes y plantillas.
- Documentación: modelo de dominio, ciclo de vida, roles, pantallas, base y trazabilidad.

## Pruebas

- Proceso: creación solo por Administración; apertura única; pausa/reanudación/cierre con
  auditoría; plantilla bloqueada con proceso abierto y editable en pausa.
- Convocatoria: hereda plantilla y fechas; no abre con proceso en preparación o pausado;
  pausa por carrera bloquea malla y fuentes solo de esa carrera; docente no envía en pausa.
- Regresión de suites existentes con el nuevo requisito de proceso.

## Pasos

- [x] Migración, modelos y bloqueo compartido.
- [x] Acciones, políticas, peticiones, controladores y rutas.
- [x] Bloqueos en plantilla, malla y fuentes.
- [x] Interfaz de Administración y Coordinación.
- [x] Pruebas y documentación.
- [x] Verificación local y migración remota.

## Riesgos y reversión

- La migración exige un proceso por convocatoria existente; la reversión elimina la
  columna y la tabla nuevas y devuelve `pausada` a `abierta`. Respaldo previo conforme a
  `docs/security/hardening.md`.

## Evidencia de cierre local

- `php artisan migrate` aplicó `2026_09_02_000027_add_syllabus_process` en local.
- `php artisan test --compact`: 306 pruebas en verde, incluida `SyllabusProcessTest`
  (8 casos: autoría del proceso, unicidad en curso, motivo de pausa, herencia de
  plantilla y fechas, bloqueo de plantilla, bloqueo de malla y fuentes por carrera,
  docentes detenidos por pausa de carrera o institucional, configuración solo en
  preparación o pausa).
- `./vendor/bin/pint --test`, `npm run lint:check`, `npm run types:check` y
  `npm run build`: en verde. `phpstan` conserva un error previo a I-31 en
  `ManagedUserController` (I-30), ajeno a este cambio.
- Remoto: respaldo `silabos_ueb_db-2026-09-02-pre-i31.dump`; migración 000027 aplicada
  en lote 13; la convocatoria demostrativa recibió su proceso «Convocatoria
  demostrativa 2026-2027» en estado `abierto` con sus mismas fechas. El artefacto de
  aplicación debe desplegarse: el anterior no conoce `proceso_id` al crear
  convocatorias.
