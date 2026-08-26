#!/usr/bin/env bash

set -Eeuo pipefail

RESTORE_CHECK_HOST="${RESTORE_CHECK_DB_HOST:-127.0.0.1}"
RESTORE_CHECK_PORT="${RESTORE_CHECK_DB_PORT:-55432}"
RESTORE_CHECK_SOURCE_DB="${RESTORE_CHECK_DB_DATABASE:-silabos_ueb_test}"
RESTORE_CHECK_USER="${RESTORE_CHECK_DB_USERNAME:-silabos_ueb}"
RESTORE_CHECK_PASSWORD="${RESTORE_CHECK_DB_PASSWORD:-silabos_ueb}"
RESTORE_CHECK_TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/silabos-restore-check.XXXXXX")"
RESTORE_CHECK_CLUSTER_DIR="${RESTORE_CHECK_TEMP_DIR}/cluster"
RESTORE_CHECK_SOCKET_DIR="${RESTORE_CHECK_TEMP_DIR}/socket"
RESTORE_CHECK_DUMP="${RESTORE_CHECK_TEMP_DIR}/source.dump"
RESTORE_CHECK_TARGET_DB="silabos_restore_check"
RESTORE_CHECK_SERVER_STARTED=0

cleanup_restore_check() {
    if [[ "${RESTORE_CHECK_SERVER_STARTED}" == "1" ]]; then
        pg_ctl --pgdata="${RESTORE_CHECK_CLUSTER_DIR}" --wait stop --mode=fast >/dev/null
    fi

    if [[ "${RESTORE_CHECK_TEMP_DIR}" == /tmp/silabos-restore-check.* ]] \
        || [[ "${RESTORE_CHECK_TEMP_DIR}" == "${TMPDIR:-/tmp}"/silabos-restore-check.* ]]; then
        find "${RESTORE_CHECK_TEMP_DIR}" -depth -delete
    fi
}

trap cleanup_restore_check EXIT

case "${RESTORE_CHECK_SOURCE_DB}" in
    *_test | *_restore_source) ;;
    *)
        printf '%s\n' 'Error: el ensayo solo admite una base fuente sintética con sufijo _test o _restore_source.' >&2
        exit 64
        ;;
esac

for command_name in pg_dump pg_restore initdb pg_ctl createdb psql sha256sum; do
    if ! command -v "${command_name}" >/dev/null 2>&1; then
        printf 'Error: falta el comando requerido %s.\n' "${command_name}" >&2
        exit 69
    fi
done

mkdir -p "${RESTORE_CHECK_SOCKET_DIR}"
PGPASSWORD="${RESTORE_CHECK_PASSWORD}" pg_dump \
    --host="${RESTORE_CHECK_HOST}" \
    --port="${RESTORE_CHECK_PORT}" \
    --username="${RESTORE_CHECK_USER}" \
    --dbname="${RESTORE_CHECK_SOURCE_DB}" \
    --format=custom \
    --compress=6 \
    --no-owner \
    --no-privileges \
    --file="${RESTORE_CHECK_DUMP}"

initdb \
    --pgdata="${RESTORE_CHECK_CLUSTER_DIR}" \
    --auth=trust \
    --encoding=UTF8 \
    --no-locale >/dev/null
pg_ctl \
    --pgdata="${RESTORE_CHECK_CLUSTER_DIR}" \
    --wait \
    --options="-k ${RESTORE_CHECK_SOCKET_DIR} -c listen_addresses='' -c fsync=off -c synchronous_commit=off" \
    start >/dev/null
RESTORE_CHECK_SERVER_STARTED=1

createdb \
    --host="${RESTORE_CHECK_SOCKET_DIR}" \
    --username="$(id -un)" \
    "${RESTORE_CHECK_TARGET_DB}"
pg_restore \
    --host="${RESTORE_CHECK_SOCKET_DIR}" \
    --username="$(id -un)" \
    --dbname="${RESTORE_CHECK_TARGET_DB}" \
    --exit-on-error \
    --single-transaction \
    --no-owner \
    --no-privileges \
    "${RESTORE_CHECK_DUMP}"

RESTORE_CHECK_QUERY="
SELECT json_build_object(
    'migrations', (SELECT count(*) FROM migrations),
    'users', (SELECT count(*) FROM usuarios),
    'subjects', (SELECT count(*) FROM asignaturas),
    'syllabi', (SELECT count(*) FROM silabos),
    'audit_events', (SELECT count(*) FROM eventos_auditoria),
    'public_tables', (
        SELECT count(*) FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ),
    'application_triggers', (
        SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal
    )
)::text;
"
RESTORE_CHECK_SOURCE_FINGERPRINT="$(
    PGPASSWORD="${RESTORE_CHECK_PASSWORD}" psql \
        --host="${RESTORE_CHECK_HOST}" \
        --port="${RESTORE_CHECK_PORT}" \
        --username="${RESTORE_CHECK_USER}" \
        --dbname="${RESTORE_CHECK_SOURCE_DB}" \
        --tuples-only \
        --no-align \
        --command="${RESTORE_CHECK_QUERY}"
)"
RESTORE_CHECK_TARGET_FINGERPRINT="$(
    psql \
        --host="${RESTORE_CHECK_SOCKET_DIR}" \
        --username="$(id -un)" \
        --dbname="${RESTORE_CHECK_TARGET_DB}" \
        --tuples-only \
        --no-align \
        --command="${RESTORE_CHECK_QUERY}"
)"

if [[ "${RESTORE_CHECK_SOURCE_FINGERPRINT}" != "${RESTORE_CHECK_TARGET_FINGERPRINT}" ]]; then
    printf '%s\n' 'Error: la base restaurada no conserva los conteos estructurales esperados.' >&2
    exit 65
fi

RESTORE_CHECK_DUMP_SHA256="$(sha256sum "${RESTORE_CHECK_DUMP}" | cut -d ' ' -f 1)"
printf 'Restore PostgreSQL verificado: fuente sintética=%s, huella_dump=%s, estructura=%s\n' \
    "${RESTORE_CHECK_SOURCE_DB}" \
    "${RESTORE_CHECK_DUMP_SHA256}" \
    "${RESTORE_CHECK_TARGET_FINGERPRINT}"
