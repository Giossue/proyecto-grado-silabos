# Incrementos de construcción

El orden reduce riesgo: primero la plataforma y las reglas determinísticas; la IA se
integra cuando el flujo humano funciona sin ella.

## I-00 — Bootstrap verificable

**Resultado:** repositorio reproducible con Laravel 13/Vue, PostgreSQL, Redis, CI,
módulos, autenticación base, almacenamiento privado y observabilidad mínima.

- Cubre: RNF-001 a RNF-008, RNF-024, RNF-029 a RNF-034 como base.
- Pantalla smoke: UI-01 y página autenticada.
- Puertas: gestor/runner fijados por lockfile; política de registro/SSO reversible.
- Salida: `active/I-00-bootstrap.md` completado y ADRs verificados.

## I-01 — Identidad, rol y estructura académica

**Resultado original:** administrador gestiona cuentas/roles y estructura; usuario cambia
de rol; políticas filtran datos. I-09 redistribuye la operación académica por carrera
sin alterar el esquema histórico de I-01.

- RF-001 a RF-016; CU-01 a CU-03.
- UI-01 a UI-04; ADM-02 a ADM-04.
- Pruebas prioritarias: autorización horizontal, vigencias, desactivación e historial.
- PV relacionados: PV-05, PV-06, PV-10, política de cuentas.

## I-02 — Plantillas y fuentes versionadas

**Resultado:** se crea, previsualiza y publica una plantilla; se versionan/activan fuentes
y se detectan conflictos.

- RF-017 a RF-033; CU-04 y CU-05.
- ADM-05 a ADM-07; COR-11.
- PV P0: PV-01, PV-02, PV-07, PV-08 para fidelidad/autoridad final.
- Se puede prototipar el constructor antes de cerrar DOCX oficial.

## I-03 — Convocatorias y elaboración de borradores

**Resultado:** coordinador abre convocatoria y genera sílabos; docente edita, autoguarda y
valida sin sobrescritura silenciosa.

- RF-034 a RF-044; CU-06 y CU-07.
- DOC-01 a DOC-05; COR-01 a COR-04.
- Incluye datos heredados, completitud, cálculo y colaboración.
- PV P0: PV-05, PV-06, PV-08.

## I-04 — Revisión, corrección, aprobación y reapertura

**Resultado:** flujo humano completo con revisiones inmutables, observaciones,
comparación, aprobación y reapertura.

- RF-045 y RF-055 a RF-065; CU-09 a CU-14.
- DOC-07 a DOC-09; COR-05 a COR-10.
- Pruebas prioritarias: máquina de estados, idempotencia, concurrencia, alcance y auditoría.
- PV P0: PV-16 para edición excepcional; la base niega mientras no se resuelva.

## I-05 — Documentos, notificaciones, informes y auditoría

**Resultado:** DOCX/PDF privados desde revisión, seguimiento, notificaciones y operación
trazable.

- RF-066 a RF-074; CU-15 a CU-17.
- DOC-10; COR-12; ADM-09 y ADM-10.
- PV P0/P1: PV-07 y PV-15; PV-11/PV-12 antes de producción.

## I-06 — Asistencia de IA explicable

**Resultado:** análisis asíncrono opcional, evidencia, control humano, feedback y
degradación segura.

- RF-046 a RF-054; CU-08; DOC-06.
- IA-NEG-01 a IA-NEG-09 y RNF-035/RNF-036.
- PV P0/P1: PV-02, PV-13, PV-14, PV-18.
- El flujo completo de I-04 debe pasar con el servicio apagado.

## I-07 — Importación institucional

**Resultado:** simulación y ejecución trazable de importación, con reconciliación y sin
escritura en la fuente.

- RF-016, RF-075; CU-18; ADM-08.
- PV P0: PV-09 y PV-10.
- Empieza por fixture/simulador; conecta al origen solo con autorización.

## I-08 — Validación, endurecimiento y piloto

**Resultado:** requisitos esenciales demostrados, pruebas no funcionales, evaluación con
usuarios, restauración y paquete de aceptación.

- CP-F01 a CP-F35; CP-N01 a CP-N16; IA-NEG-01 a IA-NEG-09.
- Cierra PV-03, PV-04, PV-11, PV-12, PV-17 a PV-20.
- Incluye entrevistas pendientes, usabilidad, rendimiento, seguridad, fidelidad documental,
  respaldo/restauración y documentación final.

## I-09 — Gobierno académico por carrera

**Resultado:** Administrador gobierna facultades, carreras, cuentas y coordinaciones;
Coordinador mantiene mallas, materias, ofertas, paralelos y asignaciones docentes dentro
de la carrera del rol activo.

- RF-003 a RF-016; RN-001 a RN-008; CU-02 y CU-03.
- ADM-02 a ADM-04; COR-13 a COR-15.
- Pruebas prioritarias: separación de rol, alcance lateral por carrera, publicación
  inmutable, asignación docente y auditoría.
- Terminología: ciclo curricular para la materia y periodo académico para fechas.

## Regla de paso

Un incremento puede solaparse en refinamiento con el anterior, pero no se considera
cerrado sin Definition of Done y evidencia reproducible. No se inicia una dependencia
irreversible de un PV P0 abierto.
