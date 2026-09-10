<?php

namespace App\Modules\Configuration\Domain;

use Illuminate\Validation\ValidationException;

/** Contrato de presentación independiente del HTML y del motor de edición. */
final class TemplateDocument
{
    public const FONTS = ['Arial', 'Calibri', 'Times New Roman', 'Verdana', 'Georgia'];

    public const FIELD_TYPES = ['texto_corto', 'texto_largo', 'numero', 'fecha', 'seleccion_unica'];

    public const CELL_ALIGNMENTS = ['left', 'center', 'right', 'justify'];

    public const CELL_BORDER_STYLES = ['thin', 'thick', 'none'];

    /** @param array<string, mixed> $document
     * @param  list<string>  $variables
     * @return array<string, mixed>
     */
    public static function normalize(array $document, array $variables): array
    {
        if (strlen(json_encode($document, JSON_THROW_ON_ERROR)) > 2000000) {
            self::fail('El diseño excede el límite de 2 MB. Divida el contenido en bloques.');
        }
        $count = 0;
        $visit = function (mixed $raw, string $parent, int $depth, bool $insideTable = false, bool $repeated = false) use (&$visit, &$count, $variables): array {
            if (++$count > 6000 || $depth > 12 || ! is_array($raw)) {
                self::fail('El diseño es demasiado grande o está mal formado.');
            }
            $type = $raw['type'] ?? '';
            $allowed = match ($parent) {
                '' => ['doc'],
                'doc', 'tableCell', 'tableHeader' => ['paragraph', 'table', 'bulletList', 'orderedList'],
                'paragraph' => ['text', 'hardBreak', 'variable', 'field', 'column'],
                'table' => ['tableRow'],
                'tableRow' => ['tableCell', 'tableHeader'],
                'bulletList', 'orderedList' => ['listItem'],
                'listItem' => ['paragraph', 'bulletList', 'orderedList'],
                default => [],
            };
            if (! in_array($type, $allowed, true)) {
                self::fail('El diseño contiene un elemento no permitido.');
            }
            $node = ['type' => $type];
            $attrs = is_array($raw['attrs'] ?? null) ? $raw['attrs'] : [];
            if ($type === 'text') {
                if (! is_string($raw['text'] ?? null) || mb_strlen($raw['text']) > 20000 || $raw['text'] === '') {
                    self::fail('El texto del diseño no es válido.');
                }
                $node['text'] = $raw['text'];
            }
            if ($type === 'variable') {
                $key = $attrs['id'] ?? null;
                if (! is_string($key) || ! in_array($key, $variables, true)) {
                    self::fail('Seleccione una variable del catálogo.');
                }
                $node['attrs'] = ['id' => $key, 'label' => $key];
            }
            if (in_array($type, ['field', 'column'], true)) {
                if ($type === 'column' && ! $repeated) {
                    self::fail('Los campos de fila deben estar dentro de su tabla repetible.');
                }
                $key = $attrs['key'] ?? '';
                $label = $attrs['label'] ?? '';
                $kind = $attrs['kind'] ?? 'texto_largo';
                if (! is_string($key) || ! preg_match('/^[a-z][a-z0-9_]{0,119}$/D', $key)
                    || ! is_string($label) || trim($label) === '' || mb_strlen($label) > 180
                    || ! in_array($kind, [...self::FIELD_TYPES, 'repetible', 'seleccion_unica', 'markdown', 'referencia_maestra', 'flujo', 'booleano'], true)) {
                    self::fail('Cada campo necesita un nombre y un tipo válido.');
                }
                $node['attrs'] = ['key' => $key, 'label' => trim($label), 'kind' => $kind];
                $options = self::options($attrs['options'] ?? null);
                if ($options !== null && $kind !== 'seleccion_unica') {
                    self::fail('Solo un campo de selección admite opciones.');
                }
                $node['attrs']['options'] = $options;
                $choice = $attrs['choice'] ?? null;
                if ($choice !== null && (! is_string($choice) || trim($choice) === '' || mb_strlen($choice) > 100)) {
                    self::fail('Opción de campo no válida.');
                }
                if ($choice !== null && $options !== null && ! in_array($choice, $options, true)) {
                    self::fail('La condición usa una opción que no pertenece al campo.');
                }
                $node['attrs']['choice'] = $choice;
                $listStyle = $attrs['listStyle'] ?? null;
                if (! in_array($listStyle, [null, 'bullet', 'number'], true)) {
                    self::fail('Formato de lista no válido.');
                }
                $node['attrs']['listStyle'] = $listStyle;
                if ($type === 'column') {
                    $role = $attrs['role'] ?? null;
                    $sum = $attrs['sum'] ?? null;
                    if ($role !== null && (! is_string($role) || ! in_array($role, TableLayout::COLUMN_ROLES, true))) {
                        self::fail('Función de columna no permitida.');
                    }
                    if ($sum !== null && ! is_bool($sum)) {
                        self::fail('Totalización de columna no válida.');
                    }
                    $node['attrs']['role'] = $role;
                    $node['attrs']['sum'] = $sum;
                }
            }
            if ($type === 'paragraph') {
                $align = $attrs['textAlign'] ?? 'left';
                if (! in_array($align, [null, 'left', 'center', 'right', 'justify'], true)) {
                    self::fail('Alineación no permitida.');
                }
                $node['attrs'] = ['textAlign' => $align];
            }
            if ($type === 'table') {
                $key = $attrs['repeatKey'] ?? null;
                if ($key !== null && (! is_string($key) || ! preg_match('/^[a-z][a-z0-9_]{0,119}$/D', $key))) {
                    self::fail('La tabla repetible no tiene un campo válido.');
                }
                $groupByUnit = $attrs['groupByUnit'] ?? null;
                if ($groupByUnit !== null && ! is_bool($groupByUnit)) {
                    self::fail('La agrupación por unidades no es válida.');
                }
                $visualStructure = $attrs['visualStructure'] ?? null;
                if ($visualStructure !== null && ! is_bool($visualStructure)) {
                    self::fail('El origen visual de la estructura no es válido.');
                }
                $node['attrs'] = [
                    'repeatKey' => $key,
                    'groupByUnit' => $groupByUnit,
                    'visualStructure' => $visualStructure,
                ];
                if ($insideTable && $key !== null) {
                    self::fail('Una tabla repetible no puede estar dentro de otra tabla.');
                }
                $insideTable = true;
                $repeated = $key !== null;
            }
            if ($type === 'tableRow') {
                $role = $attrs['rowRole'] ?? 'fixed';
                if (! in_array($role, ['fixed', 'record', 'unit', 'total'], true)) {
                    self::fail('Tipo de fila no permitido.');
                }
                $node['attrs'] = ['rowRole' => $role];
            }
            if (in_array($type, ['tableCell', 'tableHeader'], true)) {
                $span = $attrs['colspan'] ?? 1;
                $rows = $attrs['rowspan'] ?? 1;
                if (! is_int($span) || $span < 1 || $span > 24 || ! is_int($rows) || $rows < 1 || $rows > 100) {
                    self::fail('Una combinación excede los límites de la tabla (24 columnas y 100 filas).');
                }
                $widths = $attrs['colwidth'] ?? null;
                if ($widths !== null && (! is_array($widths) || ! array_is_list($widths) || count($widths) !== $span)) {
                    self::fail('Anchos de columna no válidos.');
                }
                foreach ($widths ?? [] as $width) {
                    if (! is_int($width) || $width < 0 || $width > 1200) {
                        self::fail('Ancho de columna fuera del límite.');
                    }
                }
                $background = $attrs['backgroundColor'] ?? null;
                if ($background !== null && ! self::color($background)) {
                    self::fail('Color de celda no válido.');
                }
                $textColor = $attrs['textColor'] ?? null;
                if ($textColor !== null && ! self::color($textColor)) {
                    self::fail('Color de texto de celda no válido.');
                }
                $textAlign = $attrs['textAlign'] ?? null;
                if ($textAlign !== null && ! in_array($textAlign, self::CELL_ALIGNMENTS, true)) {
                    self::fail('Alineación de celda no permitida.');
                }
                $borderStyle = $attrs['borderStyle'] ?? null;
                if ($borderStyle !== null && ! in_array($borderStyle, self::CELL_BORDER_STYLES, true)) {
                    self::fail('Borde de celda no permitido.');
                }
                $bold = $attrs['bold'] ?? null;
                $italic = $attrs['italic'] ?? null;
                if (($bold !== null && ! is_bool($bold)) || ($italic !== null && ! is_bool($italic))) {
                    self::fail('Formato de celda no válido.');
                }
                $node['attrs'] = [
                    'colspan' => $span,
                    'rowspan' => $rows,
                    'colwidth' => $widths,
                    'backgroundColor' => $background,
                    'textColor' => $textColor,
                    'textAlign' => $textAlign,
                    'bold' => $bold,
                    'italic' => $italic,
                    'borderStyle' => $borderStyle,
                ];
            }
            if (isset($raw['marks'])) {
                if (! in_array($type, ['text', 'variable', 'field', 'column'], true) || ! is_array($raw['marks']) || count($raw['marks']) > 4) {
                    self::fail('Formato de texto no válido.');
                }
                $marks = [];
                foreach ($raw['marks'] as $mark) {
                    $markType = is_array($mark) ? ($mark['type'] ?? '') : '';
                    if (! in_array($markType, ['bold', 'italic', 'underline', 'textStyle'], true)) {
                        self::fail('Formato de texto no permitido.');
                    }
                    $clean = ['type' => $markType];
                    if ($markType === 'textStyle') {
                        $style = is_array($mark['attrs'] ?? null) ? $mark['attrs'] : [];
                        $clean['attrs'] = [];
                        foreach (['fontFamily', 'fontSize', 'color'] as $property) {
                            $value = $style[$property] ?? null;
                            if ($value === null) {
                                continue;
                            }
                            $valid = match ($property) {
                                'fontFamily' => in_array($value, self::FONTS, true),
                                'fontSize' => is_string($value) && preg_match('/^(?:[7-9]|[12][0-9]|3[0-6])pt$/D', $value),
                                'color' => self::color($value),
                            };
                            if (! $valid) {
                                self::fail('Use las fuentes, tamaños y colores ofrecidos por el editor.');
                            }
                            $clean['attrs'][$property] = $value;
                        }
                    }
                    $marks[] = $clean;
                }
                $node['marks'] = $marks;
            }
            if (isset($raw['content'])) {
                if (! is_array($raw['content']) || ! array_is_list($raw['content'])) {
                    self::fail('Contenido del diseño no válido.');
                }
                $node['content'] = array_map(fn ($child) => $visit($child, $type, $depth + 1, $insideTable, $repeated), $raw['content']);
            }
            if ($type === 'tableRow') {
                $node['content'] ??= [];
            }
            if (in_array($type, ['doc', 'table', 'tableCell', 'tableHeader', 'bulletList', 'orderedList', 'listItem'], true) && empty($node['content'])) {
                self::fail('El diseño tiene una estructura vacía.');
            }
            if ($type === 'table') {
                self::assertGrid($node);
            }

            return $node;
        };

        return $visit($document, '', 0);
    }

    /** @param array<string, mixed> $table */
    private static function assertGrid(array $table): void
    {
        $rows = $table['content'];
        if (count($rows) > 100) {
            self::fail('Una tabla admite hasta 100 filas de diseño.');
        }
        $occupied = [];
        $width = null;
        foreach ($rows as $r => $row) {
            $column = 0;
            foreach ($row['content'] as $cell) {
                while (isset($occupied[$r][$column])) {
                    $column++;
                }
                $span = $cell['attrs']['colspan'];
                $height = $cell['attrs']['rowspan'];
                if ($r + $height > count($rows) || $column + $span > 24) {
                    self::fail('Una celda combinada sale de la tabla.');
                }
                for ($y = $r; $y < $r + $height; $y++) {
                    if ($table['attrs']['repeatKey'] !== null && $rows[$y]['attrs']['rowRole'] !== $row['attrs']['rowRole']) {
                        self::fail('Combine dentro de la cabecera o dentro de las filas repetibles; no entre ambas, porque su cantidad varía por docente.');
                    }
                    for ($x = $column; $x < $column + $span; $x++) {
                        if (isset($occupied[$y][$x])) {
                            self::fail('Hay celdas combinadas superpuestas.');
                        }
                        $occupied[$y][$x] = true;
                    }
                }
                $column += $span;
            }
            $size = count($occupied[$r] ?? []);
            $width ??= $size;
            if ($size !== $width || $size === 0 || array_diff(range(0, $size - 1), array_keys($occupied[$r])) !== []) {
                self::fail('Las filas deben cubrir el mismo ancho. Separe la combinación incompleta.');
            }
        }
    }

    /** @param array<string, mixed> $document
     * @return list<array<string, mixed>>
     */
    public static function nodes(array $document, string $type): array
    {
        $found = ($document['type'] ?? null) === $type ? [$document] : [];
        foreach ($document['content'] ?? [] as $child) {
            $found = [...$found, ...self::nodes($child, $type)];
        }

        return $found;
    }

    private static function color(mixed $value): bool
    {
        return is_string($value) && preg_match('/^#[0-9a-fA-F]{6}$/D', $value) === 1;
    }

    /** @return list<string>|null */
    private static function options(mixed $raw): ?array
    {
        if ($raw === null) {
            return null;
        }
        if (! is_array($raw) || ! array_is_list($raw) || count($raw) < 2 || count($raw) > 20) {
            self::fail('Un campo de selección necesita entre 2 y 20 opciones.');
        }
        $options = [];
        foreach ($raw as $option) {
            if (! is_string($option) || trim($option) === '' || mb_strlen(trim($option)) > 100) {
                self::fail('Las opciones del campo no son válidas.');
            }
            $options[] = trim($option);
        }
        if (count(array_unique($options)) !== count($options)) {
            self::fail('Las opciones del campo no pueden repetirse.');
        }

        return $options;
    }

    public static function fail(string $message): never
    {
        throw ValidationException::withMessages(['document' => $message]);
    }
}
