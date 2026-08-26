#!/usr/bin/env bash

set -Eeuo pipefail

REPOSITORY_SCAN_PATTERN='-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|github_pat_[A-Za-z0-9_]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|sk-(proj-)?[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AIza[0-9A-Za-z_-]{35}'
REPOSITORY_SCAN_FAILED=0

if rg \
    --hidden \
    --files-with-matches \
    --glob '!vendor/**' \
    --glob '!node_modules/**' \
    --glob '!public/build/**' \
    --glob '!.git/**' \
    --glob '!.env' \
    --glob '!.env.*' \
    --regexp="${REPOSITORY_SCAN_PATTERN}" \
    .; then
    printf '%s\n' 'Error: se detectó un patrón de credencial o clave privada; solo se muestran los archivos afectados.' >&2
    REPOSITORY_SCAN_FAILED=1
fi

if rg \
    --files \
    --hidden \
    --glob '*.dump' \
    --glob '*.backup' \
    --glob '*.sql' \
    --glob '!vendor/**' \
    --glob '!node_modules/**' \
    --glob '!public/build/**' \
    --glob '!.git/**' \
    --glob '!docker/postgres/init/**'; then
    printf '%s\n' 'Error: el repositorio contiene un dump de base de datos no autorizado.' >&2
    REPOSITORY_SCAN_FAILED=1
fi

if git rev-parse --is-inside-work-tree >/dev/null 2>&1 \
    && git ls-files --error-unmatch .env >/dev/null 2>&1; then
    printf '%s\n' 'Error: .env está incluido en el control de versiones.' >&2
    REPOSITORY_SCAN_FAILED=1
fi

if [[ "${REPOSITORY_SCAN_FAILED}" != "0" ]]; then
    exit 1
fi

printf '%s\n' 'Escaneo de secretos: sin patrones de credenciales, claves privadas ni dumps no autorizados.'
