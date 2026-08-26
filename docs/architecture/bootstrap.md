# Bootstrap del repositorio

Este procedimiento crea el esqueleto; no autoriza implementar decisiones institucionales
pendientes.

## Resultado esperado de I-00

- aplicación Laravel 13 con starter Vue oficial;
- Inertia 3, Vue 3, TypeScript, Tailwind y shadcn-vue funcionando;
- PostgreSQL y Redis configurados por ambiente;
- sesiones y página autenticada base;
- estructura de módulos y pruebas de dependencia;
- Docker Compose de desarrollo sin secretos;
- CI con formato, pruebas, tipos y build;
- almacenamiento privado y colas con pruebas smoke;
- `/health/live` y `/health/ready` sin revelar información sensible;
- documentación de comandos exactos.

## Secuencia

1. Crear el proyecto con `laravel new` y seleccionar Vue, autenticación Laravel y el
   runner de pruebas acordado.
2. Confirmar las versiones generadas en lockfiles y actualizar `stack.md` si difieren.
3. Desactivar registro público si no fue autorizado; no inventar SSO.
4. Configurar conexiones PostgreSQL y Redis; no usar SQLite como sustituto silencioso.
5. Copiar esta documentación en la raíz.
6. Crear `app/Modules`, proveedores y pruebas de arquitectura mínimas.
7. Crear un primer módulo vertical pequeño (identidad y rol) como patrón.
8. Configurar zona de almacenamiento privada y fake para pruebas.
9. Configurar colas `sync` en pruebas rápidas y Redis en integración/desarrollo.
10. Crear CI y ejecutar el conjunto completo en un entorno limpio.
11. Registrar dependencias/decisiones nuevas mediante ADR.

## Variables de ejemplo

`.env.example` enumera nombres y valores no secretos. Como mínimo:

```text
APP_ENV
APP_URL
APP_TIMEZONE=UTC
DISPLAY_TIMEZONE=America/Guayaquil
DB_CONNECTION=pgsql
DB_HOST
DB_PORT
DB_DATABASE
DB_USERNAME
DB_PASSWORD
REDIS_HOST
QUEUE_CONNECTION=redis
FILESYSTEM_DISK=private
AI_SERVICE_BASE_URL
AI_SERVICE_TIMEOUT_SECONDS
```

El arranque falla con un mensaje seguro si falta configuración obligatoria. Nunca se
incluyen valores productivos en el repositorio.

## No hacer en bootstrap

- seleccionar el modelo final de IA sin evaluación;
- crear tablas físicas por cada campo de plantilla;
- habilitar registro público por conveniencia;
- montar fuentes/exportaciones bajo `public/`;
- codificar excepciones de permisos todavía abiertas;
- tomar SQLite como prueba de comportamiento PostgreSQL;
- añadir microservicios para módulos internos.

