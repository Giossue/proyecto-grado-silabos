# Guía de agentes — Sílabos UEB

## Proyecto

Sistema web para centralizar, configurar y auditar el ciclo completo de los sílabos de
la Carrera de Software de la Universidad Estatal de Bolívar.

Stack base:

- Laravel 13 y PHP 8.3 o superior.
- Starter oficial Vue: Inertia 3, Vue 3 Composition API y TypeScript.
- Tailwind y shadcn-vue con componentes compartidos.
- PostgreSQL como fuente transaccional.
- Redis para colas, caché y coordinación; nunca como fuente de verdad.
- Almacenamiento privado local o compatible con S3, según entorno.
- Servicio local de IA detrás de una interfaz HTTP y trabajos asíncronos.
- Linux y contenedores para despliegue.

## Lee antes de trabajar

- Estado de decisiones: `DECISIONS_STATUS.md`.
- Producto y alcance: `docs/product/overview.md`.
- Mapa técnico: `ARCHITECTURE.md`.
- Índice de arquitectura: `docs/architecture/index.md`.
- Reglas y ciclo de vida: `docs/product/domain-model.md` y
  `docs/product/syllabus-lifecycle.md`.
- Roles: `docs/product/roles-and-permissions.md`.
- Interfaz y patrones visuales: `docs/product/screens.md`,
  `docs/architecture/frontend.md` y `docs/quality/frontend-checklist.md`.
- Plan activo: `docs/plans/active/`.
- Pendientes: `docs/plans/decisions-pending.md`.
- Trabajo pendiente y de quién depende: `docs/plans/pending-work.md`.
- Definition of Done: `docs/quality/definition-of-done.md`.
- Pruebas y trazabilidad: `docs/quality/testing.md` y
  `docs/quality/traceability.md`.
- Seguridad: `docs/security/principles.md`.

Abre además la documentación del módulo afectado. No cargues todo el repositorio sin
necesidad.

## Precedencia

1. Seguridad, privacidad e invariantes de dominio.
2. Decisiones `CONFIRMADO` y ADR aceptados.
3. Especificación del producto y criterios de aceptación.
4. Instrucciones `AGENTS.md` más cercanas al archivo modificado.
5. Plan activo.
6. Convenciones generales.

Si dos fuentes durables se contradicen, detén la decisión afectada, registra el
conflicto y solicita resolución. No elijas silenciosamente.

## Flujo obligatorio

1. Identifica los IDs `RF`, `RNF`, `RN`, `CU`, `UI`, `CP` y `PV` relacionados.
2. Comprueba si la tarea depende de una decisión `POR VALIDAR`.
3. Para trabajo no trivial, crea o actualiza un plan en `docs/plans/active/`.
4. Implementa la unidad vertical más pequeña: política, caso de uso, persistencia,
   interfaz, pruebas y documentación.
5. Ejecuta las verificaciones aplicables.
6. Actualiza la matriz de trazabilidad si cambia comportamiento observable.
7. No declares terminado mientras código, migraciones, pruebas y documentación difieran.

Un pendiente no relacionado no impide avanzar. Un pendiente que cambie permisos,
estados, datos, infraestructura o aceptación sí bloquea esa parte del código.

## Verificación

Antes de programar, inspecciona `composer.json`, `package.json` y el lockfile. En el
starter previsto, los comandos base son:

```bash
composer install
npm install
./vendor/bin/pint --test
php artisan test
npm run build
```

Ejecuta también `lint`, `typecheck`, pruebas frontend y análisis estático cuando esos
scripts existan. Usa npm salvo que un ADR y el lockfile del repositorio establezcan otro
gestor; nunca mezcles gestores o lockfiles. El comando canónico es `composer verify`;
PostgreSQL y Redis deben estar activos. Los comandos individuales sirven para diagnóstico,
pero no sustituyen la puerta completa.

La verificación debe ser proporcional al cambio. Para ajustes pequeños y mecánicos,
analiza, edita y ejecuta solo la comprobación puntual aplicable; no lances builds ni la
puerta completa. Tampoco crees scripts, auditorías o artefactos temporales para una
búsqueda y reemplazo breve: usa búsqueda directa y edición puntual. Reserva esas ayudas
y `composer verify` para cambios amplios, riesgosos o cuando se soliciten expresamente.

## Restricciones de producto

- Alcance actual: Carrera de Software UEB.
- Roles: Administrador, Coordinador y Docente.
- Estados: Sin iniciar, Borrador, En revisión, Corrección solicitada y Aprobado.
- Una revisión enviada es inmutable.
- Una revisión aprobada es inmutable.
- Reabrir conserva la aprobada y crea otra revisión enlazada.
- Las plantillas publicadas se versionan y no se sobrescriben. Las fuentes académicas son
  documentos Markdown editables de la Coordinación, sin versiones; la evidencia de IA
  guarda su propia fotografía.
- Las validaciones determinísticas y las recomendaciones de IA son conceptos separados.
- La IA muestra la fuente y el extracto citado; una persona decide y ejecuta.
- La indisponibilidad de IA degrada solo la ayuda de IA.
- Edición directa excepcional del coordinador depende de `PV-16`; no asumirla.
- No escribir en la base institucional; la integración es un adaptador de lectura/importación.
- No implementar EVEA, matrículas, notas, horarios, firma electrónica ni decisiones
  académicas automáticas.

## Reglas de implementación

- Organiza el backend por módulos y casos de uso; evita controladores con lógica de negocio.
- Usa Form Requests para validar entradas y Policies/Gates para autorización en servidor.
- Aplica alcance por registro; ocultar un botón no concede ni revoca permisos.
- Encapsula transiciones de estado y operaciones críticas en servicios/acciones de aplicación.
- Ejecuta las mutaciones críticas dentro de transacciones PostgreSQL.
- Usa UUID generados por la aplicación, `snake_case`, fechas `timestamptz` en UTC y
  restricciones de base para invariantes estructurales.
- Nunca edites migraciones ya aplicadas en entornos compartidos; agrega una nueva.
- Despacha trabajos dependientes de una transacción después del commit.
- Los trabajos de exportación, importación e IA deben ser idempotentes, observables y
  tolerantes a reintentos.
- Los archivos son privados; entrega descargas autorizadas y temporales.
- No registres secretos, documentos completos, prompts sensibles ni datos personales
  innecesarios en logs.
- No modifiques archivos generados manualmente.

## Trabajo de interfaz

Antes de modificar una pantalla, lee `docs/product/screens.md`,
`docs/architecture/frontend.md` y `docs/quality/frontend-checklist.md`, además de la
documentación del módulo afectado. Esas fuentes definen los patrones visuales,
composición, estados y criterios de revisión; este archivo solo indica dónde encontrarlos.

Antes de buscar documentación externa o añadir un componente, revisa primero los
componentes reutilizables ya presentes en `resources/js/components/`, especialmente
`components/ui/` y los componentes de dominio. Si el componente necesario existe y su
API se puede determinar leyendo su implementación y usos locales, reutilízalo sin
consultar la documentación de shadcn/u otra fuente externa. Consulta esa documentación
solo si el componente no existe, su API es ambigua o hace falta incorporar/actualizar un
componente.

## Trabajo con bases de datos

Antes de cambiar el esquema o ejecutar operaciones sobre una base, consulta las fuentes
durables correspondientes:

- modelo, invariantes y criterio de migraciones: `docs/architecture/database.md`;
- autenticación segura y procedimiento de migración remota:
  `docs/security/hardening.md`;
- secuencia de release, comprobación y recuperación:
  `docs/runbooks/release-verification.md` y `docs/architecture/deployment.md`;
- configuración local y variables no secretas: `docs/architecture/bootstrap.md`;
- despliegue administrado por Dokploy: `docs/runbooks/deploy-dokploy.md`.

Si falta información, documéntala en una de esas fuentes según su naturaleza; no copies
hosts, credenciales ni comandos específicos de un entorno dentro de `AGENTS.md`. Este
archivo funciona únicamente como orquestador para saber dónde leer.

## Control de versiones

- Haz cambios pequeños y coherentes.
- Formato de commit: `tipo(alcance): asunto imperativo`, máximo 72 caracteres.
- No hagas commit, push, rebase ni reescribas historia sin petición explícita.
- Nunca confirmes secretos, `.env`, documentos sensibles o datos de entrevistas sin
  tratamiento y autorización.

## Regla final

Si una decisión no está documentada, no la presentes como requisito confirmado. Registra
el supuesto, su impacto y la forma de validarlo.
