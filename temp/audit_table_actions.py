#!/usr/bin/env python3
"""Audita las columnas de acciones de las tablas Vue del proyecto.

Uso:
    python3 temp/audit_table_actions.py
    python3 temp/audit_table_actions.py --root /ruta/al/proyecto

El análisis es estático y deliberadamente conservador: informa los componentes y
etiquetas visibles encontrados, sin asumir que una acción existe en el backend.
"""

from __future__ import annotations

import argparse
import html
import re
from dataclasses import dataclass
from pathlib import Path


TABLE_OPEN = re.compile(r"<Table(?:\s|>)")
TABLE_CLOSE = re.compile(r"</Table\s*>")
TABLE_HEAD = re.compile(r"<TableHead\b[^>]*>(.*?)</TableHead\s*>", re.DOTALL)
MENU_ITEM = re.compile(
    r"<DropdownMenuItem\b([^>]*)>(.*?)</DropdownMenuItem\s*>",
    re.DOTALL,
)
INTERPOLATION = re.compile(r"{{.*?}}", re.DOTALL)
TAG = re.compile(r"<[^>]+>")
WHITESPACE = re.compile(r"\s+")

SECTION_NAMES = {
    "faculties": "Facultades",
    "careers": "Carreras",
    "campuses": "Campus",
    "modalities": "Modalidades",
    "academic-periods": "Periodos académicos",
    "curricula": "Mallas",
    "subjects": "Materias",
    "offerings": "Ofertas académicas",
    "parallels": "Paralelos",
}

NON_ACTION_LABELS = {
    "Archivos aún no disponibles",
    "Malla publicada e inmutable",
    "No hay acciones disponibles",
    "Sin revisión disponible",
}


@dataclass(frozen=True)
class TableAudit:
    file: str
    line: int
    name: str
    columns: tuple[str, ...]
    has_actions_column: bool
    uses_menu: bool
    actions: tuple[str, ...]
    evidence: tuple[str, ...]
    category: str


def clean_text(fragment: str) -> str:
    fragment = INTERPOLATION.sub("", fragment)
    fragment = TAG.sub(" ", fragment)
    return WHITESPACE.sub(" ", html.unescape(fragment)).strip(" ·")


def table_blocks(source: str) -> list[tuple[int, int, str]]:
    blocks: list[tuple[int, int, str]] = []
    cursor = 0
    while match := TABLE_OPEN.search(source, cursor):
        close = TABLE_CLOSE.search(source, match.end())
        if close is None:
            break
        blocks.append((match.start(), close.end(), source[match.start() : close.end()]))
        cursor = close.end()
    return blocks


def table_name(source: str, start: int, columns: tuple[str, ...], index: int) -> str:
    card_matches = list(re.finditer(r"<Card(?:\s|>)", source[:start]))
    card_start = card_matches[-1].start() if card_matches else -1
    context = source[card_start:start] if card_start >= 0 else source[max(0, start - 800) : start]

    section_matches = re.findall(r"section\s*===\s*['\"]([^'\"]+)['\"]", context)
    if section_matches and section_matches[-1] in SECTION_NAMES:
        return SECTION_NAMES[section_matches[-1]]

    title_matches = re.findall(
        r"<CardTitle\b[^>]*>(.*?)</CardTitle\s*>", context, re.DOTALL
    )
    if title_matches:
        title = clean_text(title_matches[-1])
        if title:
            return title

    meaningful = [column for column in columns if column != "Acciones"]
    if meaningful:
        return " / ".join(meaningful[:2])
    return f"Tabla {index}"


def unique(items: list[str]) -> tuple[str, ...]:
    return tuple(dict.fromkeys(item for item in items if item))


def action_details(block: str) -> tuple[tuple[str, ...], tuple[str, ...]]:
    actions: list[str] = []
    evidence: list[str] = []

    if "<CatalogActions" in block:
        actions.extend(["Editar", "Archivar/Reactivar"])
        evidence.append("CatalogActions")

    if "<UserProfileSheet" in block:
        actions.append("Editar datos")
        evidence.append("UserProfileSheet")

    if "<RecordStatusForm" in block and "<CatalogActions" not in block:
        actions.append("Archivar/Reactivar")
        entities = re.findall(
            r"<RecordStatusForm\b.*?\bentity=['\"]([^'\"]+)['\"]",
            block,
            re.DOTALL,
        )
        evidence.append(
            "RecordStatusForm" + (f" ({', '.join(unique(entities))})" if entities else "")
        )

    if "ManagedUserController.setStatus.form" in block:
        actions.append("Desactivar/Activar cuenta")
        evidence.append("ManagedUserController.setStatus")

    for attributes, content in MENU_ITEM.findall(block):
        label = clean_text(content)
        if not label or label in NON_ACTION_LABELS or "disabled" in attributes and not re.search(
            r"v-if=|:disabled=", attributes
        ):
            continue
        actions.append(label)
        evidence.append("DropdownMenuItem")

    if "download.url" in block:
        evidence.append("descarga autorizada")

    return unique(actions), unique(evidence)


def category(has_actions: bool, uses_menu: bool, actions: tuple[str, ...]) -> str:
    if not has_actions:
        return "sin columna de acciones"
    if not actions:
        return "columna sin acción detectable"
    if actions == ("Archivar/Reactivar",):
        return "solo archivar/reactivar"
    if uses_menu and len(actions) == 1:
        return "menú con una sola acción"
    if uses_menu:
        return "menú con varias acciones"
    return "acción directa"


def audit(root: Path) -> list[TableAudit]:
    audits: list[TableAudit] = []
    source_root = root / "resources" / "js"
    for path in sorted(source_root.rglob("*.vue")):
        source = path.read_text(encoding="utf-8")
        for index, (start, _end, block) in enumerate(table_blocks(source), start=1):
            columns = unique([clean_text(value) for value in TABLE_HEAD.findall(block)])
            has_actions = "Acciones" in columns
            uses_menu = "<TableActionsMenu" in block or "<CatalogActions" in block
            actions, evidence = action_details(block) if has_actions else ((), ())
            audits.append(
                TableAudit(
                    file=path.relative_to(root).as_posix(),
                    line=source.count("\n", 0, start) + 1,
                    name=table_name(source, start, columns, index),
                    columns=columns,
                    has_actions_column=has_actions,
                    uses_menu=uses_menu,
                    actions=actions,
                    evidence=evidence,
                    category=category(has_actions, uses_menu, actions),
                )
            )
    return audits


def markdown(audits: list[TableAudit]) -> str:
    action_tables = [item for item in audits if item.has_actions_column]
    status_only = [item for item in action_tables if item.category == "solo archivar/reactivar"]
    single_menu = [item for item in action_tables if item.category == "menú con una sola acción"]
    multi_menu = [item for item in action_tables if item.category == "menú con varias acciones"]

    lines = [
        "# Auditoría de acciones en tablas",
        "",
        "Análisis estático de los componentes Vue. Los elementos deshabilitados que solo",
        "explican ausencia de acciones no se cuentan como acciones disponibles.",
        "",
        "## Resumen",
        "",
        f"- Tablas encontradas: **{len(audits)}**.",
        f"- Tablas con columna `Acciones`: **{len(action_tables)}**.",
        f"- Tablas cuyo menú solo ofrece Archivar/Reactivar: **{len(status_only)}**.",
        f"- Otros menús con una sola acción: **{len(single_menu)}**.",
        f"- Menús con varias acciones: **{len(multi_menu)}**.",
        "",
        "## Tablas con columna de acciones",
        "",
        "| Tabla | Archivo | Acciones detectadas | Clasificación | Evidencia |",
        "| --- | --- | --- | --- | --- |",
    ]

    for item in action_tables:
        actions = ", ".join(item.actions) if item.actions else "—"
        evidence = ", ".join(item.evidence) if item.evidence else "—"
        lines.append(
            f"| {item.name} | `{item.file}:{item.line}` | {actions} | "
            f"{item.category} | {evidence} |"
        )

    lines.extend(
        [
            "",
            "## Tablas sin columna de acciones",
            "",
            "| Tabla | Archivo |",
            "| --- | --- |",
        ]
    )
    for item in audits:
        if not item.has_actions_column:
            lines.append(f"| {item.name} | `{item.file}:{item.line}` |")

    return "\n".join(lines) + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Raíz del repositorio (por defecto, el padre de temp/).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    print(markdown(audit(args.root.resolve())), end="")


if __name__ == "__main__":
    main()
