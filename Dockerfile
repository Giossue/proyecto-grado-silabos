# Imagen de producción de Sílabos UEB.
#
# Construye los assets con Node, resuelve dependencias PHP sin las de desarrollo y sirve
# con Nginx y PHP-FPM en un solo contenedor. PostgreSQL y Redis viven fuera: la imagen se
# conecta a los que ya existen en el servidor mediante variables de entorno.

# --- Etapa 1: dependencias PHP --------------------------------------------------------
# Se instalan sin scripts y se genera el autoload aparte: `package:discover` arrancaría
# la aplicación, y aquí todavía no hay entorno que la sostenga. La imagen de Composer no
# trae `gd`, que PhpWord declara como requisito: aquí solo se resuelven archivos, y la
# extensión sí está en la imagen final, así que se ignora únicamente en esta etapa.
FROM docker.io/library/composer:2 AS php-deps
WORKDIR /app
COPY composer.json composer.lock ./
COPY . .
RUN composer install \
        --no-dev \
        --no-scripts \
        --prefer-dist \
        --no-interaction \
        --ignore-platform-req=ext-gd \
    && composer dump-autoload --optimize --classmap-authoritative --no-dev

# --- Etapa 2: assets del navegador ----------------------------------------------------
# Wayfinder genera los helpers de rutas ejecutando `php artisan`, así que esta etapa
# necesita PHP además de Node. Solo se instalan las extensiones que Laravel exige para
# arrancar la consola; nada de esto viaja a la imagen final.
FROM docker.io/library/node:24-alpine AS assets
RUN apk add --no-cache \
        php84 \
        php84-phar \
        php84-mbstring \
        php84-tokenizer \
        php84-xml \
        php84-xmlwriter \
        php84-simplexml \
        php84-dom \
        php84-ctype \
        php84-openssl \
        php84-fileinfo \
        php84-session \
        php84-iconv \
        php84-pdo \
        php84-pdo_pgsql \
        php84-curl \
    && ln -sf /usr/bin/php84 /usr/bin/php
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY --from=php-deps /app/vendor ./vendor
COPY . .
# `.dockerignore` deja fuera los directorios de trabajo de Laravel, y `artisan` los exige
# aunque este comando no escriba en ellos.
RUN mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views \
        storage/logs bootstrap/cache \
    && npm run build

# --- Etapa 3: imagen final ----------------------------------------------------------
FROM docker.io/library/php:8.4-fpm-alpine AS runtime

# `pdo_pgsql` habla con PostgreSQL; `intl` sostiene el formato de fechas en español;
# `zip` y `gd` los necesita la exportación de documentos. `opcache` no es opcional en
# producción: sin él cada petición recompila el código.
RUN apk add --no-cache \
        nginx \
        supervisor \
        postgresql-dev \
        icu-dev \
        libzip-dev \
        freetype-dev \
        libjpeg-turbo-dev \
        libpng-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" \
        pdo_pgsql \
        intl \
        zip \
        gd \
        opcache \
        pcntl \
    && apk del postgresql-dev icu-dev libzip-dev freetype-dev libjpeg-turbo-dev libpng-dev \
    && apk add --no-cache postgresql-libs icu-libs libzip freetype libjpeg-turbo libpng

WORKDIR /var/www/html

COPY --from=php-deps /app/vendor ./vendor
COPY . .
COPY --from=assets /app/public/build ./public/build

COPY docker/app/nginx.conf /etc/nginx/nginx.conf
COPY docker/app/php.ini /usr/local/etc/php/conf.d/silabos.ini
COPY docker/app/php-fpm.conf /usr/local/etc/php-fpm.d/zz-silabos.conf
COPY docker/app/supervisord.conf /etc/supervisord.conf
COPY docker/app/entrypoint.sh /usr/local/bin/entrypoint
RUN chmod +x /usr/local/bin/entrypoint

# Laravel escribe en `storage` y en la caché de vistas. El resto del árbol permanece de
# solo lectura para el proceso web.
# Sin llaves: el `sh` de Alpine no expande `{a,b}` y crearía un directorio con ese nombre.
RUN mkdir -p \
        storage/framework/cache/data \
        storage/framework/sessions \
        storage/framework/testing \
        storage/framework/views \
        storage/logs \
        storage/app/private \
        storage/app/public \
        bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache

# nginx.conf corre los workers como www-data, pero el paquete de Alpine deja
# /var/lib/nginx/tmp (cuerpos de petición y respuestas que exceden los búferes) solo para
# el usuario nginx. Sin esto, toda subida mayor a 8 KB termina en un 500 de nginx.
RUN chown -R www-data:www-data /var/lib/nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/health/live || exit 1

ENTRYPOINT ["entrypoint"]
CMD ["supervisord", "--configuration", "/etc/supervisord.conf", "--nodaemon"]
