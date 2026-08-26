# Sílabos UEB

Sistema web para centralizar, configurar y auditar el ciclo completo de los sílabos de
la Carrera de Software de la Universidad Estatal de Bolívar.

La aplicación usa Laravel 13, Inertia 3, Vue 3 y TypeScript. PostgreSQL es la única
fuente transaccional; Redis se usa para colas, caché y coordinación descartable.

## Estado

- I-00: plataforma reproducible, autenticación administrada, health checks, cola Redis,
  almacenamiento privado y verificación automatizada.
- I-01: rol explícito, usuarios/roles, vigencias, auditoría y estructura académica,
  verificado automáticamente.
- I-02: constructor/publicación de plantillas y fuentes versionadas con conflictos humanos,
  verificado automáticamente; la aceptación final conserva sus puertas institucionales.
- I-03: convocatorias transaccionales, expedientes por alcance, editor con autoguardado y
  validación determinística, verificado automáticamente; PV-05/PV-06/PV-08 y la
  comprobación manual de accesibilidad permanecen abiertos.
- I-04: revisiones inmutables, observaciones y respuestas trazables, comparación,
  aprobación y reapertura idempotentes, verificado automáticamente; PV-16, la prueba de
  usuarios de DT-07 y la comprobación manual de accesibilidad permanecen abiertas.
- I-05: DOCX/PDF privados desde una revisión aprobada, outbox y notificaciones internas,
  informes por carrera, diagnóstico de trabajos y auditoría append-only, verificado
  automáticamente. El renderer se identifica como técnico provisional hasta resolver
  PV-07; correo, retención y purga siguen sujetos a PV-15, PV-11 y PV-12.
- I-06: asistencia de IA asíncrona y opcional con evidencia versionada, caché compatible,
  feedback y aplicación humana explícita, verificada automáticamente. El entorno de
  demostración usa `contract-simulator-v1`; modelo, hardware, corpus y umbrales finales
  siguen sujetos a PV-02, PV-13, PV-14 y PV-18.
- I-07: simulación asíncrona de importación con fixture sintético versionado, contrato
  estricto, reconciliación conservadora, conflictos humanos e historial inmutable,
  verificada automáticamente. No existe conexión ni aplicación institucional real;
  esquema, identidad y tratamiento siguen sujetos a PV-09, PV-10 y PV-12.
- I-08: carril técnico de release endurecido con CI consolidada, auditorías, accesibilidad
  estática, restore PostgreSQL efímero, smoke Redis, baseline local y guías de
  demostración/aceptación. Las pruebas con participantes y decisiones institucionales no
  se presentan como completadas.
- I-09: gobierno académico redistribuido. Administración mantiene facultades, carreras,
  usuarios y coordinaciones; cada Coordinación gestiona mallas, materias por ciclo,
  ofertas, paralelos y docentes exclusivamente dentro de su carrera, verificado
  automáticamente con alcance por registro.
- Los incrementos y sus puertas están en [docs/plans/increments.md](docs/plans/increments.md).
- Las decisiones aún institucionales no se presentan como confirmadas; consulte
  [DECISIONS_STATUS.md](DECISIONS_STATUS.md).

## Requisitos locales

- PHP 8.3 o superior y Composer 2.
- Node.js 24 y npm (el repositorio no mezcla gestores).
- Docker Compose o un proveedor compatible con Compose.
- Extensiones PHP usuales de Laravel y `pdo_pgsql`.

Las versiones exactas de paquetes están fijadas por `composer.lock` y
`package-lock.json`.

## Puesta en marcha

```bash
cp .env.example .env
composer install
npm ci
docker compose up -d
php artisan key:generate
php artisan migrate:fresh --seed
npm run build
php artisan serve
```

En otra terminal ejecute el worker:

```bash
php artisan queue:work redis \
  --queue=critical,notifications,documents,ai,integrations,default \
  --timeout=130 --tries=3
```

Los puertos locales definidos por Compose son `55432` para PostgreSQL y `56379` para
Redis, limitados a `127.0.0.1`. El inicializador también crea `silabos_ueb_test` para la
suite. No use las credenciales de desarrollo de `.env.example` en otros ambientes.

## Datos de demostración

El seeder crea únicamente datos sintéticos:

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | `admin@silabos.test` | `Demo-2026!` |
| Coordinador | `coordinador@silabos.test` | `Demo-2026!` |
| Docente | `docente@silabos.test` | `Demo-2026!` |

El registro público está desactivado. Las cuentas se administran desde la aplicación.

## Verificación

Con PostgreSQL y Redis activos:

```bash
composer verify
```

Este comando comprueba ESLint, Prettier, TypeScript, Pint, Larastan nivel 7, pruebas Pest
contra PostgreSQL y el build de producción. ESLint incluye reglas estáticas de
accesibilidad. La integración Redis es una suite separada dentro de la misma ejecución.

Smoke operacional de una cola real:

```bash
php artisan platform:smoke-job
php artisan queue:work redis --queue=critical --stop-when-empty \
  --timeout=130 --tries=3
```

Los endpoints de salud son `/health/live` y `/health/ready`.

Comprobaciones de release adicionales:

```bash
composer audit --locked --no-interaction
npm audit --audit-level=high
composer security:scan
composer verify:restore
composer benchmark:readiness
```

Restore requiere primero una base sintética `*_test`; el benchmark solo acepta una URL
HTTP de loopback. Consulte el runbook antes de ejecutarlos.

## Documentación

- Producto y alcance: [docs/product/overview.md](docs/product/overview.md)
- Arquitectura: [ARCHITECTURE.md](ARCHITECTURE.md)
- Planes activos: [docs/plans/active](docs/plans/active)
- Pruebas y trazabilidad: [docs/quality](docs/quality)
- Estado de aceptación: [docs/quality/acceptance-status.md](docs/quality/acceptance-status.md)
- Demostración de los tres roles: [docs/runbooks/demo.md](docs/runbooks/demo.md)
- Verificación de release: [docs/runbooks/release-verification.md](docs/runbooks/release-verification.md)
- Seguridad: [docs/security/principles.md](docs/security/principles.md)
- Reglas para agentes: [AGENTS.md](AGENTS.md)

Los archivos funcionales se guardan en un disco privado. Redis y el servicio de IA no
son fuentes de verdad, y la indisponibilidad de IA nunca debe bloquear el flujo humano.
La importación de demostración tampoco consulta ni modifica una fuente institucional.
