#!/usr/bin/env python3
"""Auditoría estática de tablas y columnas potencialmente sin uso.

No abre ninguna base de datos ni revisa registros. Reconstruye una aproximación del
esquema final a partir de los métodos ``up`` de las migraciones y cruza cada tabla y
columna con el código de producción. Las migraciones quedan excluidas del cruce: no
son evidencia de que el sistema actual use una entidad.

Uso: python3 temp/audit_unused_schema.py
Salida: temp/auditoria-esquema-sin-uso.md

El reporte es una lista de candidatos para revisión manual, nunca una orden de borrar:
Laravel permite consultas dinámicas, JSON y nombres de columnas compartidos.
"""

from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS = ROOT / "database/migrations"
REPORT = ROOT / "temp/auditoria-esquema-sin-uso.md"
PRODUCTION_ROOTS = ("app", "routes", "config", "resources/js")
SUPPORT_ROOTS = ("tests", "database/seeders", "database/factories")
FRAMEWORK_TABLES = {
    "migrations", "password_reset_tokens", "sessions", "failed_jobs",
    "sesiones", "restablecimientos_contrasena", "trabajos_fallidos",
}
FRAMEWORK_COLUMNS = {"id", "created_at", "updated_at", "creado_en", "actualizado_en", "registrado_en", "deleted_at"}
COLUMN_METHODS = {
    "bigIncrements", "bigInteger", "binary", "boolean", "char", "date",
    "dateTime", "dateTimeTz", "decimal", "double", "enum", "float",
    "foreignId", "foreignUuid", "integer", "ipAddress", "json", "jsonb",
    "longText", "mediumInteger", "mediumText", "smallInteger", "string",
    "text", "time", "timeTz", "timestamp", "timestampTz", "tinyInteger",
    "unsignedBigInteger", "unsignedInteger", "unsignedMediumInteger",
    "unsignedSmallInteger", "unsignedTinyInteger", "uuid", "ulid", "year",
}


def balanced(source: str, start: int) -> tuple[str, int]:
    """Return braced text, beginning at ``{``, and its end position."""
    depth = 0
    quote: str | None = None
    escaped = False
    for position in range(start, len(source)):
        char = source[position]
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            continue
        if char in "'\"":
            quote = char
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return source[start + 1:position], position + 1
    raise ValueError("Bloque PHP sin cierre")


def up_body(source: str) -> str:
    match = re.search(r"public\s+function\s+up\s*\([^)]*\)\s*(?::\s*[^\{]+)?\{", source)
    if not match:
        return ""
    body = expand_private_calls(source, balanced(source, match.end() - 1)[0])
    return expand_foreach_literals(inline_simple_constants(source, body))


def expand_private_calls(source: str, body: str, seen: set[str] | None = None) -> str:
    """Inline private migration helpers called from ``up`` for static inspection."""
    seen = seen or set()
    pattern = re.compile(r"\$this->(\w+)\s*\([^;]*\);")

    def replace(match: re.Match[str]) -> str:
        name = match.group(1)
        if name in seen:
            return ""
        method = re.search(rf"private\s+function\s+{re.escape(name)}\s*\([^)]*\)\s*(?::\s*[^\{{]+)?\{{", source)
        if not method:
            return match.group(0)
        helper, _ = balanced(source, method.end() - 1)
        return expand_private_calls(source, helper, seen | {name})

    return pattern.sub(replace, body)


def inline_simple_constants(source: str, body: str) -> str:
    """Inline one-dimensional migration constants used in DDL ``foreach`` loops."""
    for match in re.finditer(r"private\s+const\s+(\w+)\s*=\s*\[([^\[\]]*)\];", source, re.S):
        body = body.replace(f"self::{match.group(1)}", f"[{match.group(2)}]")
    return body


def expand_foreach_literals(body: str) -> str:
    """Expand ``foreach (['a', 'b'] as $table)`` used by migrations' DDL."""
    pattern = re.compile(
        r"foreach\s*\(\s*\[(?P<items>.*?)\]\s+as\s+\$(?P<variable>\w+)(?:\s*=>\s*\$\w+)?\s*\)\s*\{",
        re.S,
    )
    offset = 0
    while match := pattern.search(body, offset):
        loop, end = balanced(body, match.end() - 1)
        values = quoted_values(match.group("items"))
        variable = match.group("variable")
        expanded: list[str] = []
        for value in values:
            copy = loop.replace("{$" + variable + "}", value)
            copy = re.sub(rf"\${re.escape(variable)}\b", f"'{value}'", copy)
            expanded.append(copy)
        body = body[:match.start()] + "\n".join(expanded) + body[end:]
        offset = match.start() + len("\n".join(expanded))
    return body


def quoted_values(arguments: str) -> list[str]:
    return re.findall(r"['\"]([^'\"]+)['\"]", arguments)


def blueprint_columns(body: str) -> set[str]:
    columns: set[str] = set()
    for match in re.finditer(r"\$\w+->(\w+)\s*\(([^;]*)\)", body):
        method, arguments = match.groups()
        values = quoted_values(arguments)
        if method in COLUMN_METHODS and values:
            columns.add(values[0])
        elif method in {"timestamps", "timestampsTz"}:
            columns.update({"created_at", "updated_at"})
        elif method == "rememberToken":
            columns.add("remember_token")
    return columns


def migration_blocks(body: str) -> list[tuple[str, str, str]]:
    blocks: list[tuple[str, str, str]] = []
    pattern = re.compile(
        r"Schema::(create|table)\s*\(\s*['\"]([^'\"]+)['\"]\s*,\s*function\s*\([^)]*\)\s*(?::\s*[^\{]+)?\{"
    )
    for match in pattern.finditer(body):
        closure, _ = balanced(body, match.end() - 1)
        blocks.append((match.group(1), match.group(2), closure))
    return blocks


def remove_or_rename_columns(columns: set[str], body: str) -> None:
    for match in re.finditer(r"->drop(?:ConstrainedForeignId|Column)\s*\(([^;]*)\)", body):
        columns.difference_update(quoted_values(match.group(1)))
    for match in re.finditer(r"->renameColumn\s*\(\s*['\"]([^'\"]+)['\"]\s*,\s*['\"]([^'\"]+)['\"]", body):
        old, new = match.groups()
        if old in columns:
            columns.remove(old)
            columns.add(new)


def schema_from_migrations() -> dict[str, set[str]]:
    """Approximate final schema by applying migration *up* operations in order."""
    schema: dict[str, set[str]] = {}
    for path in sorted(MIGRATIONS.glob("*.php")):
        body = up_body(path.read_text())
        for operation, table, closure in migration_blocks(body):
            if operation == "create":
                schema[table] = blueprint_columns(closure)
            elif table in schema:
                schema[table].update(blueprint_columns(closure))
                remove_or_rename_columns(schema[table], closure)
        for match in re.finditer(r"Schema::rename\s*\(\s*['\"]([^'\"]+)['\"]\s*,\s*['\"]([^'\"]+)['\"]", body):
            old, new = match.groups()
            if old in schema:
                schema[new] = schema.pop(old)
        for match in re.finditer(r"ALTER TABLE\s+(\w+)\s+RENAME TO\s+(\w+)", body):
            old, new = match.groups()
            if old in schema:
                schema[new] = schema.pop(old)
        for match in re.finditer(r"ALTER TABLE\s+(\w+)\s+RENAME COLUMN\s+(\w+)\s+TO\s+(\w+)", body):
            table, old, new = match.groups()
            if table in schema and old in schema[table]:
                schema[table].remove(old)
                schema[table].add(new)
        apply_constant_column_renames(path.read_text(), schema)
        for table in re.findall(r"Schema::dropIfExists\s*\(\s*['\"]([^'\"]+)['\"]", body):
            schema.pop(table, None)
    return schema


def apply_constant_column_renames(source: str, schema: dict[str, set[str]]) -> None:
    """Handle the two structured rename maps used by the Spanish-schema migrations."""
    user_map = re.search(r"private\s+const\s+RENOMBRES\s*=\s*\[(.*?)\];", source, re.S)
    if user_map and "ALTER TABLE usuarios RENAME COLUMN" in source:
        for old, new in re.findall(r"['\"]([^'\"]+)['\"]\s*=>\s*['\"]([^'\"]+)['\"]", user_map.group(1)):
            if old in schema.get("usuarios", set()):
                schema["usuarios"].remove(old)
                schema["usuarios"].add(new)

    columns_map = re.search(r"private\s+const\s+COLUMNAS\s*=\s*\[(.*?)\n\s*\];", source, re.S)
    if not columns_map:
        return
    for table, mappings in re.findall(
        r"['\"]([^'\"]+)['\"]\s*=>\s*\[(.*?)\],", columns_map.group(1), re.S
    ):
        for old, new in re.findall(r"['\"]([^'\"]+)['\"]\s*=>\s*['\"]([^'\"]+)['\"]", mappings):
            if old in schema.get(table, set()):
                schema[table].remove(old)
                schema[table].add(new)


def source_files(roots: tuple[str, ...]) -> dict[Path, str]:
    files: dict[Path, str] = {}
    for root in roots:
        base = ROOT / root
        if base.exists():
            for path in base.rglob("*"):
                if path.suffix in {".php", ".ts", ".vue", ".js"} and path.is_file():
                    files[path] = path.read_text(errors="ignore")
    return files


def model_index(app_files: dict[Path, str]) -> tuple[dict[str, Path], dict[str, str]]:
    by_table: dict[str, Path] = {}
    by_class: dict[str, str] = {}
    for path, source in app_files.items():
        if "/Models/" not in str(path):
            continue
        class_match = re.search(r"\bclass\s+(\w+)\b", source)
        table_match = re.search(r"\$table\s*=\s*['\"]([^'\"]+)['\"]", source)
        if class_match and table_match:
            by_table[table_match.group(1)] = path
            by_class[class_match.group(1)] = table_match.group(1)
    return by_table, by_class


def occurrences(term: str, files: dict[Path, str]) -> list[Path]:
    pattern = re.compile(rf"(?<![A-Za-z0-9_]){re.escape(term)}(?![A-Za-z0-9_])")
    return [path for path, source in files.items() if pattern.search(source)]


def without_model_metadata(source: str) -> str:
    """Mapping alone is not evidence that a field is read or written by a use case."""
    for property_name in ("fillable", "hidden", "casts"):
        source = re.sub(
            rf"protected\s+\${property_name}\s*=\s*\[.*?\];", "", source, flags=re.S
        )
    return source


def runtime_column_files(column: str, files: dict[Path, str], model_path: Path | None) -> list[Path]:
    filtered = dict(files)
    if model_path in filtered:
        filtered[model_path] = without_model_metadata(filtered[model_path])
    return occurrences(column, filtered)


def main() -> None:
    schema = schema_from_migrations()
    production = source_files(PRODUCTION_ROOTS)
    support = source_files(SUPPORT_ROOTS)
    model_tables, model_classes = model_index(production)
    domain_tables = {table: columns for table, columns in schema.items() if table not in FRAMEWORK_TABLES}
    unused_tables: list[tuple[str, str]] = []
    unused_columns: dict[str, list[tuple[str, str, bool]]] = defaultdict(list)

    for table, columns in sorted(domain_tables.items()):
        model_path = model_tables.get(table)
        model_name = next((name for name, mapped in model_classes.items() if mapped == table), None)
        literal_refs = [path for path in occurrences(table, production) if path != model_path]
        class_refs = [path for path in occurrences(model_name, production) if path != model_path] if model_name else []
        if not literal_refs and not class_refs:
            support_refs = occurrences(table, support)
            if model_name:
                support_refs += occurrences(model_name, support)
            unused_tables.append((table, "solo soporte" if support_refs else "sin referencia"))

        model_source = production.get(model_path, "") if model_path else ""
        for column in sorted(columns - FRAMEWORK_COLUMNS):
            if runtime_column_files(column, production, model_path):
                continue
            support_refs = occurrences(column, support)
            declared = bool(model_source and re.search(rf"['\"]{re.escape(column)}['\"]", model_source))
            unused_columns[table].append((column, "solo soporte" if support_refs else "sin referencia", declared))

    lines = [
        "# Auditoría estática de esquema sin uso", "",
        "Generado por `python3 temp/audit_unused_schema.py`. No consultó una base de datos ni registros.",
        "El esquema se obtuvo de los métodos `up` de las migraciones; migraciones, documentación y artefactos no cuentan como uso.", "",
        "## Resultado", f"- Tablas de dominio reconstruidas: **{len(domain_tables)}**",
        f"- Modelos Eloquent mapeados: **{len(model_tables)}**",
        f"- Tablas candidatas: **{len(unused_tables)}**",
        f"- Columnas candidatas: **{sum(map(len, unused_columns.values()))}**", "",
        "## Tablas sin consumidor de producción identificable",
    ]
    if unused_tables:
        lines.extend(f"- `{table}` — {evidence}" for table, evidence in unused_tables)
    else:
        lines.append("- Ninguna.")
    lines.extend(["", "## Columnas sin lectura/escritura identificable"])
    if unused_columns:
        for table, candidates in sorted(unused_columns.items()):
            for column, evidence, declared in candidates:
                warning = " (declarada en el modelo; revisar uso dinámico)" if declared else ""
                lines.append(f"- `{table}.{column}` — {evidence}{warning}")
    else:
        lines.append("- Ninguna.")
    lines.extend([
        "", "## Cómo interpretar", "",
        "- **sin referencia**: no apareció en `app`, `routes`, `config` ni `resources/js`; es el candidato de mayor prioridad para revisión.",
        "- **solo soporte**: aparece únicamente en pruebas, factories o seeders; puede ser deuda de esquema o una ruta aún no implementada.",
        "- El análisis no demuestra que una columna sea eliminable: una clave foránea, historial, SQL dinámico, JSON o integración pueden necesitarla aunque no aparezca como palabra literal.",
        "- Antes de eliminar: verificar restricciones/FK, migrar en una copia y conservar una migración reversible según `docs/security/hardening.md`.",
    ])
    REPORT.write_text("\n".join(lines) + "\n")
    print("\n".join(lines))
    print(f"\nReporte: {REPORT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
