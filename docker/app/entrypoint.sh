#!/bin/sh
# Arranque del contenedor. Todo lo que hay aquí es idempotente: Dokploy reinicia y
# redespliega, así que ejecutarlo dos veces no puede romper nada.
set -e

cd /var/www/html

# Defensa por si el archivo del servidor de desarrollo llegara por otra vía: su presencia
# haría que la aplicación pidiera los assets a un localhost que aquí no existe.
rm -f public/hot

if [ -z "${APP_KEY}" ]; then
    echo "ERROR: falta APP_KEY. Genérela con 'php artisan key:generate --show' y" >&2
    echo "       cárguela como variable de entorno en Dokploy." >&2
    exit 1
fi

# La caché de configuración congela las variables de entorno, así que se reconstruye en
# cada arranque: si no, un cambio en Dokploy no tendría efecto hasta reconstruir la imagen.
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache

# Se espera a la base antes de migrar. Postgres vive fuera del contenedor y puede tardar
# en aceptar conexiones tras un reinicio del servidor.
attempt=1
until php artisan db:monitor --max=1 >/dev/null 2>&1 || [ "${attempt}" -ge 30 ]; do
    echo "Esperando a PostgreSQL (intento ${attempt}/30)…"
    attempt=$((attempt + 1))
    sleep 2
done

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
    # `--isolated` usa un bloqueo para que dos réplicas no migren a la vez.
    php artisan migrate --force --isolated
fi

# El enlace de almacenamiento público es idempotente y sobrevive a redespliegues.
php artisan storage:link || true

exec "$@"
