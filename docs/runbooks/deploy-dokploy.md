# Despliegue en Dokploy

La aplicación se despliega como **una sola imagen** construida desde este repositorio.
PostgreSQL y Redis no viajan en ella: la imagen se conecta a los que ya existen en el
servidor mediante variables de entorno.

Dentro del contenedor conviven cuatro procesos bajo `supervisord`: Nginx, PHP-FPM, el
worker de colas y el planificador. Escalar la aplicación escala el conjunto; separar el
worker exigiría otra aplicación en Dokploy apuntando a la misma imagen con otro comando.

## 1. Crear la aplicación

En Dokploy, **Application** con origen **GitHub**, repositorio
`Giossue/proyecto-grado-silabos`, rama `main`. Como es privado, autoriza la cuenta de
GitHub desde Dokploy antes de crearlo.

Tipo de construcción: **Dockerfile**, ruta `./Dockerfile`. El puerto del contenedor es
**8080**, no 80: la imagen sirve en un puerto no privilegiado para poder arrancar también
sin root.

## 2. Variables de entorno

`APP_KEY` es obligatoria y el contenedor se niega a arrancar sin ella. Genera una con:

```
php artisan key:generate --show
```

Copia el valor completo, incluido el prefijo `base64:`.

```
APP_NAME="Sílabos UEB"
APP_ENV=production
APP_KEY=base64:...
APP_DEBUG=false
APP_URL=https://tu-dominio
APP_TIMEZONE=UTC
DISPLAY_TIMEZONE=America/Guayaquil
APP_LOCALE=es

DB_CONNECTION=pgsql
DB_HOST=...        # host del PostgreSQL del servidor
DB_PORT=5432
DB_DATABASE=silabos_ueb
DB_USERNAME=...
DB_PASSWORD=...
DB_TIMEZONE=UTC

REDIS_CLIENT=predis
REDIS_HOST=...
REDIS_PORT=6379
REDIS_PASSWORD=...

CACHE_STORE=redis
QUEUE_CONNECTION=redis
SESSION_DRIVER=database
SESSION_SECURE_COOKIE=true

FILESYSTEM_DISK=private
LOG_CHANNEL=stderr
LOG_LEVEL=warning

AI_DRIVER=disabled
INSTITUTIONAL_IMPORT_DRIVER=disabled
```

`SESSION_SECURE_COOKIE=true` requiere HTTPS. Actívalo solo cuando el dominio tenga
certificado, o nadie podrá iniciar sesión.

La base de datos debe existir antes del primer despliegue; el contenedor migra, pero no
crea la base.

## 3. Qué hace el arranque

`docker/app/entrypoint.sh`, en cada arranque y de forma idempotente:

1. verifica `APP_KEY` y aborta con un mensaje claro si falta;
2. borra `public/hot` por si el marcador del servidor de desarrollo llegara por otra vía;
3. reconstruye las cachés de configuración, rutas, vistas y eventos —se rehacen siempre,
   porque congelan las variables de entorno y un cambio en Dokploy no tendría efecto de
   otro modo—;
4. espera hasta 60 segundos a que PostgreSQL acepte conexiones;
5. ejecuta `migrate --force --isolated`, con bloqueo para que dos réplicas no migren a la
   vez. Se puede desactivar con `RUN_MIGRATIONS=false`;
6. crea el enlace de almacenamiento público.

## 4. Comprobación

`GET /health/live` responde sin tocar la base: sirve para el chequeo de vida del
orquestador. `GET /health/ready` verifica base y Redis, y responde `{"status":"ready"}`.

## 5. Primer administrador

El seeder de demostración **no** se ejecuta en producción. Crea la primera cuenta desde la
consola del contenedor con `php artisan tinker`, o ejecuta el seeder solo si el entorno es
de prueba. Las cuentas creadas desde el panel nacen con contraseña temporal de un solo uso
y su titular debe cambiarla antes de operar.

## 6. Almacenamiento persistente

`storage/app` guarda los documentos exportados. Sin un volumen montado ahí, cada
redespliegue los pierde. En Dokploy, añade un **volume mount** hacia
`/var/www/html/storage/app`.

## Fuera de alcance

El servicio local de IA y el conector institucional quedan desactivados
(`AI_DRIVER=disabled`, `INSTITUTIONAL_IMPORT_DRIVER=disabled`). Dependen de `PV-13`,
`PV-14` y del acceso de red productivo a la fuente, que siguen abiertos.
