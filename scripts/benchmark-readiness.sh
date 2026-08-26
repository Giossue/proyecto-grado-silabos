#!/usr/bin/env bash

set -Eeuo pipefail

READINESS_BENCHMARK_URL="${READINESS_BENCHMARK_URL:-http://127.0.0.1:8000/health/ready}"
READINESS_BENCHMARK_REQUESTS="${READINESS_BENCHMARK_REQUESTS:-500}"
READINESS_BENCHMARK_CONCURRENCY="${READINESS_BENCHMARK_CONCURRENCY:-50}"
READINESS_BENCHMARK_OUTPUT="$(mktemp "${TMPDIR:-/tmp}/silabos-readiness-benchmark.XXXXXX")"

cleanup_readiness_benchmark() {
    rm -f -- "${READINESS_BENCHMARK_OUTPUT}"
}

trap cleanup_readiness_benchmark EXIT

case "${READINESS_BENCHMARK_URL}" in
    http://127.0.0.1:*/* | http://localhost:*/* | http://\[::1\]:*/*) ;;
    *)
        printf '%s\n' 'Error: el benchmark solo admite una URL HTTP de loopback con puerto explícito.' >&2
        exit 64
        ;;
esac

if [[ ! "${READINESS_BENCHMARK_REQUESTS}" =~ ^[1-9][0-9]*$ ]] \
    || [[ ! "${READINESS_BENCHMARK_CONCURRENCY}" =~ ^[1-9][0-9]*$ ]]; then
    printf '%s\n' 'Error: solicitudes y concurrencia deben ser enteros positivos.' >&2
    exit 64
fi

if (( READINESS_BENCHMARK_REQUESTS > 10000 || READINESS_BENCHMARK_CONCURRENCY > 200 )); then
    printf '%s\n' 'Error: el benchmark local limita solicitudes a 10000 y concurrencia a 200.' >&2
    exit 64
fi

if (( READINESS_BENCHMARK_CONCURRENCY > READINESS_BENCHMARK_REQUESTS )); then
    printf '%s\n' 'Error: la concurrencia no puede superar el número de solicitudes.' >&2
    exit 64
fi

for command_name in curl awk sort xargs date seq wc tr; do
    if ! command -v "${command_name}" >/dev/null 2>&1; then
        printf 'Error: falta el comando requerido %s.\n' "${command_name}" >&2
        exit 69
    fi
done

READINESS_BENCHMARK_STARTED_AT="$(date +%s%N)"
seq "${READINESS_BENCHMARK_REQUESTS}" \
    | xargs -P "${READINESS_BENCHMARK_CONCURRENCY}" -I '{}' sh -c '
        curl --silent --show-error --output /dev/null \
            --connect-timeout 2 --max-time 5 \
            --write-out "%{http_code} %{time_total}\n" "$1" \
            || printf "000 5.000000\n"
    ' _ "${READINESS_BENCHMARK_URL}" \
    >"${READINESS_BENCHMARK_OUTPUT}"
READINESS_BENCHMARK_FINISHED_AT="$(date +%s%N)"

READINESS_BENCHMARK_TOTAL="$(wc -l <"${READINESS_BENCHMARK_OUTPUT}" | tr -d ' ')"
READINESS_BENCHMARK_FAILURES="$({ awk '$1 != 200 { count++ } END { print count + 0 }' "${READINESS_BENCHMARK_OUTPUT}"; })"
READINESS_BENCHMARK_SUCCESSFUL="$((READINESS_BENCHMARK_TOTAL - READINESS_BENCHMARK_FAILURES))"

if (( READINESS_BENCHMARK_SUCCESSFUL > 0 )); then
    READINESS_BENCHMARK_P95_INDEX="$(( (READINESS_BENCHMARK_SUCCESSFUL * 95 + 99) / 100 ))"
    READINESS_BENCHMARK_P95="$({
        awk '$1 == 200 { print $2 }' "${READINESS_BENCHMARK_OUTPUT}" \
            | sort -n \
            | awk -v rank="${READINESS_BENCHMARK_P95_INDEX}" 'NR == rank { print; exit }'
    })"
else
    READINESS_BENCHMARK_P95='n/a'
fi

READINESS_BENCHMARK_ELAPSED="$({
    awk -v start="${READINESS_BENCHMARK_STARTED_AT}" -v finish="${READINESS_BENCHMARK_FINISHED_AT}" \
        'BEGIN { printf "%.3f", (finish - start) / 1000000000 }'
})"
READINESS_BENCHMARK_RATE="$({
    awk -v total="${READINESS_BENCHMARK_TOTAL}" -v elapsed="${READINESS_BENCHMARK_ELAPSED}" \
        'BEGIN { if (elapsed > 0) printf "%.2f", total / elapsed; else print "0.00" }'
})"

printf 'Benchmark readiness: solicitudes=%s, concurrencia=%s, fallos=%s, p95=%ss, tasa=%s req/s, duración=%ss\n' \
    "${READINESS_BENCHMARK_TOTAL}" \
    "${READINESS_BENCHMARK_CONCURRENCY}" \
    "${READINESS_BENCHMARK_FAILURES}" \
    "${READINESS_BENCHMARK_P95}" \
    "${READINESS_BENCHMARK_RATE}" \
    "${READINESS_BENCHMARK_ELAPSED}"

if (( READINESS_BENCHMARK_FAILURES > 0 )); then
    exit 65
fi
