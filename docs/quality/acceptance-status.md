# Estado de aceptación

Fecha de corte: **14 de agosto de 2026**.

## Lectura correcta de esta matriz

El repositorio recibido enumera `CP-F01..CP-F35` y `CP-N01..CP-N16`, pero no contiene el
enunciado individual de esos 51 casos. Por ello no es trazable ni honesto asignar un
resultado a cada número. La tabla siguiente acredita capacidades contra RF/RNF, CU,
interfaces y suites existentes; la aceptación formal caso por caso queda pendiente de
incorporar el artefacto maestro con los enunciados CP.

Estados usados:

- **Verificado automático**: existe prueba reproducible y aprobada.
- **Verificado técnico**: existe smoke/harness local, pero no aceptación institucional.
- **Pendiente manual**: requiere una persona, dispositivo o inspección visual.
- **Bloqueado PV**: una autoridad o evidencia externa debe resolver la puerta.
- **No evaluable por ID**: falta el enunciado formal del CP; no significa fallo funcional.

## Evidencia funcional disponible

| Capacidad                                               | IDs relacionados                                          | Evidencia                                                                                                                                                                                   | Estado                                                               |
| ------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Acceso, rol, cuentas y alcance                     | RF-001..007; CU-01..02; UI-01..04; ADM-02..03             | `AuthenticationTest`, `ActiveRoleTest`, `ManagedUserTest`, pruebas de settings                                                                                                             | Verificado automático                                                |
| Gobierno y estructura académica                         | RF-008..016; CU-03; ADM-04; COR-13..15                    | `AcademicStructureTest`: jerarquía normalizada, rutas hijas, edición auditada, archivo/reactivación, permisos, catálogos separados, ciclo, alcance, publicación, oferta y asignación; `CoordinatorAssignmentConstraintTest` y `ManagementCreationUiTest` | Verificado automático                                                |
| Plantillas y fuentes versionadas                        | RF-017..033; CU-04..05; ADM-05..07; COR-11                | `TemplateAndSourceTest`, triggers de publicación y resolución humana                                                                                                                        | Verificado automático; autoridad/fidelidad bloqueadas PV             |
| Convocatoria, borrador y validación                          | RF-034..044; CU-06..07; COR-01..04; DOC-01..05            | `CampaignAndDraftTest`: atomicidad, alcance, tipos, autoguardado, 409 y validación                                                                                                          | Verificado automático; volumen/UX pendientes                         |
| Envío, corrección, comparación, aprobación y reapertura | RF-045, RF-055..065; CU-09..14; DOC-07..09; COR-05..10    | `ReviewWorkflowTest`: snapshots, estados, idempotencia, concurrencia e inmutabilidad                                                                                                        | Verificado automático; DT-07/UX pendientes                           |
| Documentos, notificaciones, informes y auditoría        | RF-066..074; CU-15..17; UI-03; DOC-10; COR-12; ADM-09..10 | `DocumentOperationsTest`, archivos privados, outbox, retry y alcance                                                                                                                        | Verificado automático; fidelidad DOCX/S3/correo pendientes           |
| Asistencia de IA                                        | RF-046..054; CU-08; DOC-06; IA-NEG-01..09                 | `AiAssistanceTest` y regresión con `AI_DRIVER=disabled`                                                                                                                                     | Verificado automático con simulador; evaluación experta bloqueada PV |
| Consistencia de módulos autenticados                    | UI-02..04; DOC-01..10; COR-01..15; ADM-01..11             | `PageFrame` en 29 páginas operativas y el layout de Configuración; inventario de `ManagementCreationUiTest`                                                                                  | Verificado automático; inspección visual y asistiva pendiente PV-19  |

## Evidencia no funcional disponible

| Área                              | Evidencia reproducible                                                                                                  | Estado y límite                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Calidad de código                 | `composer verify`: ESLint, Prettier, TypeScript, Pint, Larastan nivel 7, 145 pruebas/1.765 aserciones PostgreSQL y Vite | Verificado automático el 2026-08-14                              |
| Arquitectura                      | `ModuleBoundariesTest` y revisión de módulos/acciones/policies                                                          | Verificado automático para reglas codificadas                    |
| Seguridad HTTP                    | `HealthAndSecurityTest`, CSP, CORP, headers, HSTS condicional y readiness sin cookies                                   | Verificado automático; DAST/pentest manual pendiente             |
| Dependencias y secretos           | `composer audit --locked`, `npm audit --audit-level=high`, `composer security:scan`, CI semanal                         | Verificado técnico a la fecha; debe repetirse                    |
| PostgreSQL                        | migración/seed desde cero, sesión UTC, seeder idempotente, constraints, triggers, transacciones y suite real            | Verificado automático/local                                      |
| Redis y jobs                      | `RedisConnectionTest`, dispatch after-commit, idempotencia y smoke `critical` con worker real                           | Verificado automático/técnico                                    |
| Recuperación                      | `composer verify:restore` sobre dump sintético y clúster efímero                                                        | Verificado técnico; política/RPO/RTO/objetos bloqueados PV-11/12 |
| Rendimiento                       | `composer benchmark:readiness`: 500 solicitudes, concurrencia 50, cero fallos, p95 local 0,415 s                        | Baseline técnico; no acepta RNF ni carga funcional               |
| Accesibilidad estática            | `eslint-plugin-vuejs-accessibility`; etiquetas explícitas, sin autofocus ni tabindex positivo                           | Verificado automático para reglas estáticas                      |
| Accesibilidad/compatibilidad real | teclado, lector, foco de diálogos, contraste, 360 px, zoom 200 %, claro/oscuro y dispositivos reales                    | Pendiente manual / PV-19                                         |
| Fidelidad documental              | estructura, contenido, huellas y descarga privada automatizados                                                         | Comparación visual con DOCX oficial pendiente / PV-07            |
| IA real                           | contrato, ataques negativos, trazabilidad, control humano y degradación                                                 | Modelo/corpus/hardware/umbrales pendientes / PV-02/13/14/18      |

## Estado de las series CP

| Serie                | Resultado que puede afirmarse                                                                       | Resultado que no puede afirmarse                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| CP-F01..CP-F35       | Las capacidades funcionales de CU-01..18 tienen suites y evidencia agrupada arriba.                 | No se puede marcar cada CP-F como aprobado hasta disponer de su enunciado y correspondencia oficial.           |
| CP-N01..CP-N16       | Hay evidencia técnica de seguridad, calidad, PostgreSQL, Redis, restore y un baseline de readiness. | No se puede aceptar cada CP-N ni sus umbrales/ambiente sin los enunciados, PV-05, PV-11/12 y pruebas manuales. |
| IA-NEG-01..IA-NEG-09 | Los nueve escenarios descritos en `testing.md` están cubiertos por `AiAssistanceTest`.              | No sustituyen evaluación experta del modelo/corpus ni aceptación de utilidad.                                  |

La acción correctiva es incorporar la fuente maestra de CP sin renumerarla, añadir una
fila individual `CP → requisito → prueba → resultado → evidencia → responsable` y ejecutar
los casos manuales en staging autorizado.

## Puertas institucionales

| Puertas                    | Estado       | Qué falta / valor técnico seguro                                                                                                 |
| -------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| PV-01, PV-02, PV-07, PV-08 | Bloqueado PV | Autoridad de plantilla, precedencia, DOCX y fórmulas. Se versiona, no se sobrescribe; renderer/cálculo permanecen provisionales. |
| PV-03, PV-04               | Bloqueado PV | Periodo y responsable de aceptación del piloto. No se asignan por defecto.                                                       |
| PV-05                      | Bloqueado PV | Volumen real de docentes, paralelos, asignaciones y sílabos; el baseline no fija capacidad.                                       |
| PV-06                      | Cerrada      | Un sílabo por paralelo como regla; `per_parallel` predeterminado y `per_offering` conservado por DT-11.                            |
| PV-09, PV-10               | Bloqueado PV | Acceso/esquema y claves institucionales. Solo fixture, dry-run, conflicto y exclusión; nunca aplicación.                         |
| PV-11, PV-12               | Bloqueado PV | Backup/RPO/RTO/retención y base legal/privacidad. Solo restore sintético y minimización.                                         |
| PV-13, PV-14, PV-18        | Bloqueado PV | Hardware, modelo y umbrales. IA desactivada por defecto y simulador contractual opcional.                                        |
| PV-15                      | Bloqueado PV | Canal y contenido de correo. Solo notificación interna y mailer de log local.                                                    |
| PV-16                      | Bloqueado PV | Edición excepcional por Coordinador. El servidor la niega.                                                                       |
| PV-17, PV-19, PV-20        | Bloqueado PV | Instrumento/población, dispositivos reales y metadatos académicos. No se inventan entrevistas ni resultados.                     |

## Acta mínima pendiente

La persona responsable de aceptación debe registrar, en un ambiente autorizado:

1. versión/commit y configuración no sensible;
2. fecha, rol y participantes con consentimiento;
3. enunciado exacto de cada CP-F/CP-N y resultado esperado;
4. resultado, evidencia controlada, severidad y decisión por caso;
5. matriz de navegador/dispositivo, teclado/lector, contraste, zoom y documento oficial;
6. carga con datos representativos y percentiles de rutas funcionales, autoguardado y
   exportación;
7. restore conjunto de PostgreSQL y objetos privados contra RPO/RTO aprobados;
8. evaluación experta de IA y cierre explícito de cada PV aplicable.

Hasta entonces el sistema es **candidato técnico verificable**, no un producto aceptado
institucionalmente ni autorizado para datos reales.
