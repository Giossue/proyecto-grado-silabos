# I-08: Validación técnica, endurecimiento y preparación del piloto

## Estado

Carril técnico implementado y verificado localmente el 2026-08-14. La aceptación
institucional y las pruebas con participantes permanecen abiertas por decisiones y
evidencia externas; no se atribuye un cierre ficticio al piloto.

## Trazabilidad

- RF-001 a RF-075; RN-001 a RN-034; CU-01 a CU-18.
- RNF-001 a RNF-036.
- UI-01 a UI-04, DOC-01 a DOC-10, COR-01 a COR-12 y ADM-01 a ADM-11.
- CP-F01 a CP-F35, CP-N01 a CP-N16 e IA-NEG-01 a IA-NEG-09.
- PV-03, PV-04, PV-05, PV-07, PV-09, PV-11 a PV-15 y PV-17 a PV-20.

## Resultado demostrable

Desde una base PostgreSQL vacía se instala, migra, puebla, verifica y compila el sistema.
Un guion reproducible permite demostrar los tres roles y todos los flujos técnicos
implementados. La entrega conserva una puerta de release automatizada, auditoría de
dependencias, smoke de servicios y un ensayo de backup/restauración sobre datos
sintéticos. La matriz de aceptación distingue evidencia automática, manual pendiente y
decisiones institucionales sin atribuirles un resultado inventado.

## Decisiones y límites

- `PV-03` y `PV-04`: no se fija periodo ni responsable de aceptación.
- `PV-05`: la carga de 50 usuarios es un baseline técnico propuesto, no capacidad
  institucional aceptada.
- `PV-07`: se verifica estructura del renderer provisional, no fidelidad al DOCX oficial.
- `PV-09`, `PV-10` y `PV-12`: no se conecta ni aplica una importación real.
- `PV-11`: un restore efímero demuestra el procedimiento técnico, no confirma RPO, RTO,
  retención, cifrado, ubicación ni responsable.
- `PV-13`, `PV-14` y `PV-18`: el simulador verifica el contrato, no calidad de un modelo.
- `PV-17`, `PV-19` y `PV-20`: entrevistas, matriz real de dispositivos y metadatos
  académicos se registran como pendientes de evidencia humana.

## Cambios previstos

- Calidad/release: consolidar CI, auditorías de lockfiles y comprobaciones de producción.
- Recuperación: script seguro para backup/restore en una base PostgreSQL efímera.
- Demostración: guía exacta de instalación y recorrido Administrador/Coordinador/Docente.
- Aceptación: matriz CP/PV con resultado, evidencia, responsable requerido y estado.
- Seguridad: escaneo local de configuración/secreto, cabeceras y dependencias sin publicar
  valores sensibles.
- Rendimiento: harness o baseline reproducible sin afirmar volúmenes no validados.

## Pasos

- [x] Auditar CI, lockfiles, configuración de producción y dependencias.
- [x] Implementar y ejecutar backup/restore efímero con datos sintéticos.
- [x] Ejecutar migración/seed desde cero, suite completa, build y smokes reales.
- [x] Crear guía de demostración de CU-01..18 para los tres roles.
- [x] Crear matriz de aceptación técnica/manual para CP-F, CP-N, IA-NEG y PV.
- [x] Auditar las 39 páginas Vue y las altas de gestión accesibles para Administrador,
      Coordinador y Docente; proteger el patrón de `Sheet` derecho con una prueba de
      arquitectura.
- [ ] Completar revisión manual responsive, teclado, lector, contraste y dispositivos
      acordados; la revisión automática ya está incorporada a ESLint.
- [x] Actualizar trazabilidad, README, runbooks y evidencia técnica reproducible.
- [x] Mantener como pendientes las validaciones humanas/institucionales sin falsificarlas.

## Riesgos y reversión

- Toda prueba destructiva usa una base efímera con nombre generado y validado; nunca la
  base de desarrollo o producción.
- Los audits pueden depender de registros externos y se registran con fecha; no sustituyen
  revisión de seguridad.
- El load test solo usa datos sintéticos/locales y no establece SLA final.
- Los cambios de CI son reversibles y no alteran dependencias ni despliegues externos.

## Evidencia del carril técnico

- `.github/workflows/verify.yml` consolida instalación, migración/seed, audits y puerta
  canónica; `tests.yml` ejecuta auditoría semanal/manual. Acciones fijadas por commit y
  permisos de solo lectura.
- `composer audit --locked` y `npm audit --audit-level=high`: cero avisos/vulnerabilidades
  reportados el 2026-08-14; `composer security:scan` sin patrones ni dumps prohibidos.
- `composer verify:restore`: restauración íntegra de 14 migraciones, 65 tablas públicas y
  40 triggers de aplicación, con 3 usuarios y la asignatura sintética del seeder.
- Smoke Redis real en `critical`: estado completado, progreso 100 % e intento 1. La
  documentación enumera todas las colas; `retry_after=180` supera el timeout máximo de
  120 s y está protegido por prueba.
- Readiness real sin cookies y con cabeceras endurecidas. Baseline reproducible de 500
  solicitudes/concurrencia 50: cero fallos, p95 0,415 s y 126,42 req/s sobre servidor PHP
  local con cachés de producción; no se presenta como aceptación RNF.
- ESLint incorpora el preset de accesibilidad y se corrigieron etiquetas, autofocus,
  orden de teclado y un `aria-invalid` literal. La revisión asistiva/manual sigue abierta.
- `ManagementCreationUiTest` registra 13 superficies de alta para los tres roles,
  exige el `Sheet` derecho compartido, cierre solo tras éxito y mantiene explícitas las
  mutaciones de flujo que permanecen en páginas completas.
- Se retiró la autoeliminación heredada del starter: la desactivación administrativa es el
  único camino de baja y conserva asignaciones/auditoría; una prueba impide reintroducir
  la ruta destructiva. Autenticación y ajustes visibles quedaron unificados en español.
- La conexión PostgreSQL fija UTC y `DatabaseBootstrapTest` protege la doble ejecución
  del seeder; las asignaciones abiertas se reutilizan sin reescribir su vigencia histórica.
- `docs/runbooks/demo.md`, `docs/runbooks/release-verification.md` y
  `docs/quality/acceptance-status.md` separan demostración técnica, evidencia manual y PV.
- Último `composer verify`: 145 pruebas y 1.765 aserciones;
  escaneo, ESLint, Prettier, TypeScript, Pint, Larastan nivel 7 y build aprobados. Con IA
  desactivada: 19 pruebas y
  353 aserciones del flujo humano.
- CI remota, pruebas de participantes y cierre individual de CP/PV requieren
  autoridad/evidencia externa.
