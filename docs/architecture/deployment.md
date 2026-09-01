# Despliegue

## Unidades

```text
reverse proxy / TLS
├── web Laravel + Inertia assets
├── worker Laravel (colas)
├── scheduler Laravel
├── servicio local IA (opcional/degradable)
├── PostgreSQL
├── Redis
└── almacenamiento privado / S3 compatible
```

El monolito web, workers y scheduler comparten el mismo artefacto/versionado, con procesos
distintos. La plataforma concreta puede ser Docker Compose, Dokploy u otra; el producto
no depende de una interfaz de despliegue.

## Ambientes

- `local`: datos sintéticos y proveedores fake/locales.
- `test`: aislado y reproducible; PostgreSQL para integración.
- `staging`: configuración similar a producción y datos anonimizados/autorizados.
- `production`: mínimo privilegio, TLS, backups y observación.

No se copian bases productivas a desarrollo sin proceso de anonimización y autorización.

## Release

1. CI completa y artefacto inmutable.
2. backup/restore comprobado según política vigente.
3. migraciones revisadas y compatibles con despliegue gradual cuando aplique.
4. modo mantenimiento solo si es necesario y comunicado.
5. ejecutar migraciones una vez.
6. desplegar web/workers/scheduler de versión compatible.
7. comprobar readiness, migraciones, colas, archivos y smoke tests.
8. observar errores/latencia y ejecutar rollback/forward fix según runbook.

La secuencia reproducible y sus límites están en
`docs/runbooks/release-verification.md`.

## Salud

- Liveness confirma que el proceso responde.
- Readiness comprueba dependencias críticas con timeout corto.
- IA no vuelve no-ready al núcleo; se expone como capacidad degradada.
- Los endpoints no revelan versiones, credenciales o topología al público.

## Configuración y secretos

- variables/secret manager por ambiente;
- rotación documentada;
- claves separadas por servicio;
- base y almacenamiento con mínimo privilegio;
- ningún secreto en imagen, repositorio, log o frontend.

## Workers

Los jobs usan colas nombradas: `critica`, `notificaciones`, `documentos`, `ia` e
`integraciones`. El despliegue debe supervisarlas explícitamente; un worker que escuche
solo `general` no procesa esos trabajos. Para un smoke local puede usarse:

```bash
php artisan queue:work redis \
  --queue=critica,notificaciones,documentos,ia,integraciones,general \
  --timeout=130 --tries=3
```

En producción se prefieren procesos separados según prioridad/capacidad. El timeout del
worker debe ser menor que `REDIS_QUEUE_RETRY_AFTER=180`; los jobs más largos tienen 120 s.
Después de desplegar, reinicia workers de forma controlada y verifica ADM-09.

## Pendientes productivos

Antes de producción: `PV-09`, `PV-11`, `PV-12`, `PV-13`, `PV-15` y la política de SSO/
cuentas deben estar resueltos. RPO, RTO, retención, capacidad y responsables se ensayan,
no se dejan como texto aspiracional.
