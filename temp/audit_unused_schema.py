#!/usr/bin/env python3
"""Audita tablas y columnas del esquema sin uso en el código.

Requiere la base de Postgres levantada (podman start silabos-ueb-postgres).

Pasadas:
  1. Esquema real via `php artisan tinker` (Schema::getTables/getColumns).
  2. Cruce global: cada tabla/columna buscada como palabra completa en código
     de producción (app/, routes/, config/, resources/js) y en soporte
     (tests/, database/seeders, database/factories). Migraciones excluidas:
     ahí todo aparece por definición.
  3. Cruce por modelo: columnas de la tabla vs $fillable del modelo Eloquent.
     - columna fuera de $fillable => informativo (puede asignarse por relación
       o quedar solo-lectura a propósito).
     - entrada de $fillable sin columna => error real.

Limitación: en el cruce global, un nombre genérico (nombre, activo) usado en
la tabla A oculta a la misma columna muerta en la tabla B. Los nombres únicos
sí son concluyentes.

Uso: python3 temp/audit_unused_schema.py
Salida: resumen en stdout + temp/auditoria-esquema-sin-uso.md
"""

from __future__ import annotations

import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPORT = ROOT / "temp" / "auditoria-esquema-sin-uso.md"

PROD_DIRS = ["app", "routes", "config", "resources/js"]
SUPPORT_DIRS = ["tests", "database/seeders", "database/factories"]

# Tablas y columnas que Laravel usa internamente; nunca aparecen en código propio.
FRAMEWORK_TABLES = {
    "cache", "cache_locks", "jobs", "job_batches", "failed_jobs",
    "migrations", "password_reset_tokens", "sessions",
}
FRAMEWORK_COLS = {"id", "created_at", "updated_at", "deleted_at"}

TINKER_SNIPPET = (
    "foreach (Illuminate\\Support\\Facades\\Schema::getTables() as $t) {"
    " $cols = array_map(fn($c) => $c['name'],"
    " Illuminate\\Support\\Facades\\Schema::getColumns($t['name']));"
    " echo $t['name'], '|', implode(',', $cols), PHP_EOL; }"
)


def dump_schema() -> dict[str, list[str]]:
    result = subprocess.run(
        ["php", "artisan", "tinker", "--execute", TINKER_SNIPPET],
        cwd=ROOT, capture_output=True, text=True,
    )
    schema: dict[str, list[str]] = {}
    for line in result.stdout.splitlines():
        if "|" in line:
            table, cols = line.strip().split("|", 1)
            schema[table] = cols.split(",")
    if not schema:
        sys.exit(
            "No se pudo leer el esquema. ¿Base levantada? "
            "(podman start silabos-ueb-postgres)\n" + result.stdout + result.stderr
        )
    return schema


def count_hits(term: str, dirs: list[str]) -> int:
    total = 0
    for d in dirs:
        r = subprocess.run(
            ["rg", "-w", "--count-matches", "--no-filename", term, str(ROOT / d)],
            capture_output=True, text=True,
        )
        total += sum(int(n) for n in r.stdout.split())
    return total


def parse_models() -> dict[str, tuple[str, set[str]]]:
    """tabla -> (archivo del modelo, columnas en $fillable)."""
    models: dict[str, tuple[str, set[str]]] = {}
    for path in (ROOT / "app").rglob("Models/*.php"):
        source = path.read_text()
        table_match = re.search(r"\$table\s*=\s*'([^']+)'", source)
        if not table_match:
            continue
        fillable: set[str] = set()
        fillable_match = re.search(r"\$fillable\s*=\s*\[(.*?)\]", source, re.S)
        if fillable_match:
            fillable = set(re.findall(r"'([^']+)'", fillable_match.group(1)))
        models[table_match.group(1)] = (str(path.relative_to(ROOT)), fillable)
    return models


def main() -> None:
    schema = dump_schema()
    models = parse_models()

    unused_tables: list[tuple[str, str]] = []
    unused_cols: dict[str, list[tuple[str, str]]] = defaultdict(list)
    not_fillable: dict[str, list[str]] = {}
    fillable_ghosts: dict[str, list[str]] = {}

    for table, cols in sorted(schema.items()):
        if table == "migrations" or table in FRAMEWORK_TABLES:
            continue
        if count_hits(table, PROD_DIRS) == 0:
            tag = "solo tests/seeders" if count_hits(table, SUPPORT_DIRS) else "SIN USO"
            unused_tables.append((table, tag))
            continue
        for col in cols:
            if col in FRAMEWORK_COLS:
                continue
            if count_hits(col, PROD_DIRS) == 0:
                tag = "solo tests/seeders" if count_hits(col, SUPPORT_DIRS) else "SIN USO"
                unused_cols[table].append((col, tag))

        if table in models:
            model_file, fillable = models[table]
            if fillable:
                schema_cols = set(cols) - FRAMEWORK_COLS
                missing = sorted(schema_cols - fillable)
                ghosts = sorted(fillable - set(cols))
                if missing:
                    not_fillable[table] = missing
                if ghosts:
                    fillable_ghosts[table] = ghosts

    lines = ["# Auditoría de esquema sin uso", ""]
    lines.append("## Tablas sin referencia en código de producción")
    lines += [f"- `{t}` [{tag}]" for t, tag in unused_tables] or ["- (ninguna)"]
    lines += ["", "## Columnas sin referencia (tablas usadas)"]
    if unused_cols:
        for table in sorted(unused_cols):
            lines += [f"- `{table}.{c}` [{tag}]" for c, tag in unused_cols[table]]
    else:
        lines.append("- (ninguna)")
    lines += ["", "## $fillable declara columnas que no existen (error real)"]
    if fillable_ghosts:
        for table, ghosts in sorted(fillable_ghosts.items()):
            lines.append(f"- `{table}`: {', '.join(ghosts)}")
    else:
        lines.append("- (ninguna)")
    lines += ["", "## Columnas fuera de $fillable (informativo: relación/solo lectura)"]
    if not_fillable:
        for table, cols in sorted(not_fillable.items()):
            lines.append(f"- `{table}`: {', '.join(cols)}")
    else:
        lines.append("- (ninguna)")
    lines += ["", f"Tablas de dominio analizadas: "
              f"{len([t for t in schema if t not in FRAMEWORK_TABLES and t != 'migrations'])} · "
              f"modelos con $table: {len(models)}"]

    report = "\n".join(lines) + "\n"
    REPORT.write_text(report)
    print(report)
    print(f"Reporte: {REPORT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
