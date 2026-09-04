# I-46: Convocatoria institucional y arranque por carrera

## Estado

Completado localmente — 4 de septiembre de 2026. Pendiente únicamente aplicar la
migración mediante el release remoto aprobado.

## Trazabilidad

- RF-008..016, RF-027..036; RN-005..008 y RN-017..019; CU-03 y CU-06.
- ADM-04, ADM-12, COR-02..04, COR-11 y COR-13..15.
- Reemplaza, por decisión explícita del responsable del producto, la preparación manual
  de convocatoria por Coordinación de I-31/I-41.

## Decisiones aplicadas

- Administración prepara y abre una sola convocatoria institucional (`procesos_silabos`)
  por período académico de toda la universidad.
- Coordinación no prepara ni configura nombre, agrupación o fuentes. Ve los procesos
  institucionales y elige uno ya abierto solo para iniciar o pausar el alcance de su
  carrera.
- Iniciar crea el alcance de carrera de forma atómica y genera exactamente un sílabo por
  paralelo activo con docente vigente.
- Todas las fuentes académicas activas de la carrera se fijan automáticamente al iniciar
  y se vuelven a sincronizar al reanudar tras una pausa. No hay selección manual.
- Abrir el proceso institucional exige plantilla utilizable y estructura institucional
  lista: carreras activas con campus y coordinación vigente. Iniciar el alcance exige,
  además, malla activa, ofertas/paralelos del período y docentes vigentes en cada
  paralelo.

## Cambios previstos

1. Restricciones PostgreSQL: un proceso por período y un alcance de convocatoria por
   carrera/período; conservar agrupaciones históricas, pero generar siempre por paralelo.
2. Casos de uso y políticas: retirar creación/edición manual por Coordinación, verificar
   preparación institucional/carrera y sincronizar fuentes automáticamente.
3. UI: COR-02 muestra procesos institucionales y permite iniciar/pausar; se retiran los
   campos de nombre, agrupación y fuentes.
4. Pruebas, documentación de dominio/pantallas/permisos/trazabilidad y procedimiento de
   migración remota.

## Verificación ejecutada

- PostgreSQL local: migración aplicada en `migrate:fresh` y restricciones ejercitadas.
- 155 pruebas relevantes: proceso, convocatoria, plazos, relevo, transferencia,
  revisión, estructura y rutas/UI.
- Pint, PHPStan del módulo Syllabus, tipos Vue, lint, build y `git diff --check`.

## Observación remota inicial

Consulta con `BEGIN READ ONLY` el 2026-09-04: un proceso en preparación; cero
convocatorias, sílabos, agrupaciones históricas o duplicados por carrera/período. La
migración puede añadir las restricciones tras comprobar nuevamente esa condición.
