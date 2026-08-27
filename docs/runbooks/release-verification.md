# Verificación de release y recuperación

## Alcance

Esta guía produce evidencia técnica reproducible para I-08. No autoriza un despliegue
productivo: RPO/RTO, retención, privacidad, infraestructura, responsables y criterios de
aceptación continúan sujetos a los `PV` indicados en la matriz de aceptación.

## 1. Puerta desde instalación limpia

Use PostgreSQL y Redis locales/aislados. No ejecute dos suites simultáneas contra la misma
base porque `RefreshDatabase` recrea el esquema.

```bash
composer validate --strict --no-check-publish
composer install --no-interaction --prefer-dist
npm ci
cp .env.example .env
php artisan key:generate
docker compose up -d
DB_DATABASE=silabos_ueb_test php artisan migrate:fresh --seed --force
composer verify
```

`composer verify` es la puerta canónica: escaneo de secretos, ESLint y accesibilidad
estática, Prettier, TypeScript, Pint, Larastan nivel 7, Pest sobre PostgreSQL y build Vite.
La CI repite la migración/seed antes de la puerta y fija las acciones por commit.

Audite por separado los lockfiles, porque la información de vulnerabilidades cambia con
el tiempo:

```bash
composer audit --locked --no-interaction
npm audit --audit-level=high
composer security:scan
```

## 2. Configuración de candidato

Antes de almacenar cachés, verifique al menos:

- `APP_ENV=production`, `APP_DEBUG=false`, URL HTTPS y clave generada fuera del repo;
- cookies seguras y proxy confiable configurados para el ambiente real;
- usuario PostgreSQL de runtime sin DDL, conexiones de red restringidas y
  `DB_TIMEZONE=UTC`;
- `QUEUE_CONNECTION=redis` y `REDIS_QUEUE_RETRY_AFTER` mayor que 120 s;
- almacenamiento privado persistente; ningún volumen funcional bajo `public/`;
- `AI_DRIVER=disabled` si no existe servicio local aprobado;
- correo, backup, retención y observabilidad resueltos antes de producción.

Después:

```bash
php artisan optimize
php artisan route:list --except-vendor
php artisan migrate:status
```

Use `php artisan optimize:clear` al volver al ambiente local. Nunca copie `.env` o la
salida de comandos que contengan secretos a la evidencia pública.

## 3. Salud HTTP y cabeceras

Con el candidato en ejecución:

```bash
curl --silent --show-error --dump-header - --output /dev/null \
  http://127.0.0.1:8000/health/ready
```

Espere `200`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, CSP con
`object-src 'none'`, política de referencia/permisos y
`Cross-Origin-Resource-Policy: same-origin`. Readiness no debe crear cookies de sesión ni
XSRF. HSTS solo aparece en una petición HTTPS de producción; el proxy debe preservar el
esquema confiablemente. La respuesta JSON no revela versiones ni topología.

## 4. Cola Redis real

Despache una clave sintética única y procese la cola correcta:

```bash
php artisan platform:smoke-job --key=release-smoke-local
php artisan queue:work redis --queue=critical --stop-when-empty \
  --timeout=130 --tries=3
```

Confirme **Completado**, progreso 100 % e intento 1 en **Administración → Trabajos**.
En ejecución continua, supervise procesos separados o un worker que escuche:

```text
critical,notifications,documents,ai,integrations,default
```

La lista está ordenada por prioridad. Después de un despliegue ejecute
`php artisan queue:restart` y confirme que todos los procesos vuelven con el mismo
artefacto. PostgreSQL conserva el estado; vaciar Redis nunca debe borrar evidencia
funcional.

## 5. Backup y restauración técnica

El ensayo se niega a usar una fuente cuyo nombre no termine en `_test` o
`_restore_source`. Crea un dump temporal, inicia un clúster PostgreSQL aislado solo por
socket Unix, restaura en una transacción, compara conteos estructurales y elimina los
temporales al salir.

```bash
DB_DATABASE=silabos_ueb_test php artisan migrate:fresh --seed --force
composer verify:restore
```

Si las credenciales de prueba difieren, use `RESTORE_CHECK_DB_HOST`,
`RESTORE_CHECK_DB_PORT`, `RESTORE_CHECK_DB_DATABASE`, `RESTORE_CHECK_DB_USERNAME` y
`RESTORE_CHECK_DB_PASSWORD` solo en el proceso local. No las registre.

Una salida satisfactoria conserva migraciones, usuarios, asignaturas, sílabos, auditoría,
tablas y triggers. Esto demuestra que el procedimiento funciona sobre datos sintéticos;
no confirma cifrado, ubicación, retención, RPO, RTO ni restauración de objetos privados
(`PV-11` y `PV-12`).

## 6. Baseline local de readiness

Levante la aplicación local y, en otra terminal, ejecute:

```bash
composer benchmark:readiness
```

El script admite únicamente HTTP en loopback, limita el volumen y usa por defecto 500
peticiones con concurrencia 50. Registra fallos, p95, tasa y duración. Para otro puerto:

```bash
READINESS_BENCHMARK_URL=http://127.0.0.1:18765/health/ready \
  composer benchmark:readiness
```

El 14 de agosto de 2026, PHP 8.5.8 con el servidor integrado, PostgreSQL 18 y Redis 8
produjo 500/500 respuestas, p95 0,415 s y 126,42 req/s con cachés de producción. Es un
baseline técnico del endpoint de salud, no una aceptación de RNF-011..015 ni una
simulación de 50 docentes autenticados; eso requiere volumen y ambiente confirmados por
`PV-05`.

## 7. Criterios de avance y reversión

No promueva el candidato si falla una migración, la puerta canónica, readiness, la cola,
el restore, una autorización crítica o una revisión de seguridad. Registre el fallo con
correlación y sin datos sensibles.

El despliegue debe conservar el artefacto anterior y un camino de forward-fix. Las
migraciones aplicadas no se editan ni se revierten destructivamente por rutina. Una
restauración real requiere autorización del responsable, punto de recuperación acordado,
resguardo de la base afectada y reconciliación de archivos/colas; el script local no
reemplaza ese runbook institucional.
