<?php

namespace App\Modules\Documents\Infrastructure\Rendering;

use App\Modules\Configuration\Domain\TableLayout;
use App\Modules\Documents\Domain\Data\DocumentRenderInput;
use App\Modules\Syllabus\Application\IdentificationCard;
use PhpOffice\PhpWord\Element\Section;
use PhpOffice\PhpWord\Element\Table;
use PhpOffice\PhpWord\PhpWord;
use PhpOffice\PhpWord\Settings;
use PhpOffice\PhpWord\SimpleType\Jc;
use PhpOffice\PhpWord\SimpleType\TblWidth;

/**
 * Arma el sílabo en Word con el estándar del impreso (I-33/I-34): hoja carta,
 * márgenes 2.5 cm, Arial 11, títulos numerados, tablas con cabecera azul y filas
 * alternas celestes. Las tablas complejas se dibujan desde el esquema copiado en la
 * revisión: agrupaciones en dos niveles, cabecera por unidad y totales.
 */
class SyllabusWordDocument
{
    private const FONT = 'Arial';

    private const BLUE = '4F81BD';

    private const LIGHT_BLUE = 'DBE5F1';

    private const TITLE_BLUE = '0070C0';

    private const BORDER = '7F7F7F';

    /** Ancho útil en twips: carta (12240) menos dos márgenes de 2.5 cm (1417). */
    private const CONTENT_WIDTH = 9406;

    private const MARGIN = 1417;

    /** @var array<string, mixed> */
    private array $paragraph = ['spaceAfter' => 120, 'spaceBefore' => 0, 'lineHeight' => 1.15];

    private mixed $snapshotIdentification = null;

    public function build(DocumentRenderInput $input): PhpWord
    {
        Settings::setOutputEscapingEnabled(true);
        $this->snapshotIdentification = $input->snapshot['identification'] ?? null;

        $word = new PhpWord;
        $word->setDefaultFontName(self::FONT);
        $word->setDefaultFontSize(11);
        $word->setDefaultParagraphStyle($this->paragraph);

        // Fechas fijas: el mismo contenido produce los mismos bytes (huella estable).
        $timestamp = strtotime($input->generatedAt) ?: 0;
        $info = $word->getDocInfo();
        $info->setCreator('Sílabos UEB');
        $info->setTitle($input->subject);
        $info->setDescription('Revisión '.$input->revisionNumber);
        $info->setCreated($timestamp);
        $info->setModified($timestamp);

        $word->addNumberingStyle('silabo-bullets', [
            'type' => 'multilevel',
            'levels' => [['format' => 'bullet', 'text' => '•', 'left' => 360, 'hanging' => 360, 'font' => 'Symbol']],
        ]);
        $word->addNumberingStyle('silabo-numbers', [
            'type' => 'multilevel',
            'levels' => [['format' => 'decimal', 'text' => '%1.', 'left' => 360, 'hanging' => 360]],
        ]);

        $section = $word->addSection([
            'paperSize' => 'Letter',
            'marginTop' => self::MARGIN,
            'marginBottom' => self::MARGIN,
            'marginLeft' => self::MARGIN,
            'marginRight' => self::MARGIN,
        ]);

        $this->logos($section);
        $section->addText(
            'PROGRAMA DE ASIGNATURA (SÍLABO)',
            ['bold' => true, 'size' => 16, 'color' => self::TITLE_BLUE],
            ['alignment' => Jc::CENTER, 'spaceBefore' => 240, 'spaceAfter' => 240],
        );

        foreach ($this->arrayList($input->snapshot['sections'] ?? null) as $sectionIndex => $block) {
            $number = $sectionIndex + 1;
            $section->addText(
                $number.'. '.$this->string($block['title'] ?? null, 'Bloque'),
                ['bold' => true, 'size' => 12],
                ['spaceBefore' => 240, 'spaceAfter' => 120, 'keepNext' => true],
            );
            $containers = $this->arrayList($block['blocks'] ?? null);
            foreach ($containers as $fieldIndex => $container) {
                // Un solo campo en la sección: basta el título de la sección.
                $this->field($section, $container, count($containers) > 1 ? $number.'.'.($fieldIndex + 1) : null);
            }
        }

        $this->metadata($section, $input);

        return $word;
    }

    private function logos(Section $section): void
    {
        $ueb = public_path('images/silabo/ueb.jpeg');
        $faculty = public_path('images/silabo/facultad.jpeg');
        if (! is_file($ueb) && ! is_file($faculty)) {
            return;
        }

        $table = $section->addTable(['width' => 100 * 50, 'unit' => TblWidth::PERCENT]);
        $row = $table->addRow();
        $left = $row->addCell(6000, ['valign' => 'center']);
        if (is_file($ueb)) {
            $left->addImage($ueb, ['height' => 28]);
        }
        $right = $row->addCell(3406, ['valign' => 'center']);
        if (is_file($faculty)) {
            $right->addImage($faculty, ['height' => 40, 'alignment' => Jc::END]);
        }
    }

    /** Pie con la trazabilidad de la revisión: huella y fecha, en letra pequeña. */
    private function metadata(Section $section, DocumentRenderInput $input): void
    {
        $section->addText(
            sprintf(
                'Revisión %d · %s · huella %s · generado %s',
                $input->revisionNumber,
                $input->subject.' ('.$input->subjectCode.')',
                $input->revisionFingerprint,
                $input->generatedAt,
            ),
            ['size' => 7, 'color' => '7F7F7F'],
            ['spaceBefore' => 360, 'spaceAfter' => 0],
        );
    }

    /**
     * Ficha de identificación calcada del formato: nueve columnas, combinaciones
     * horizontales con `gridSpan` y verticales con `vMerge`. Las celdas tapadas por
     * una combinación vertical se rellenan con continuaciones.
     *
     * @param  list<list<array{text: string, span: int, rows: int, style: string, bold: bool, small: bool, center: bool}>>  $grid
     */
    private function identification(Section $section, array $grid): void
    {
        $table = $section->addTable([
            'borderSize' => 4,
            'borderColor' => self::BORDER,
            'cellMargin' => 50,
            'width' => 100 * 50,
            'unit' => TblWidth::PERCENT,
        ]);
        $widths = array_map(
            fn (float $percent): int => (int) round(self::CONTENT_WIDTH * $percent / 100),
            IdentificationCard::WIDTHS,
        );
        /** @var array<int, array{rows: int, span: int}> $merged columna => filas pendientes de continuación */
        $merged = [];

        foreach ($grid as $cells) {
            $row = $table->addRow();
            $column = 0;
            $queue = $cells;
            while ($column < count($widths)) {
                if (isset($merged[$column])) {
                    $span = $merged[$column]['span'];
                    $row->addCell($this->width($widths, $column, $span), ['vMerge' => 'continue', 'gridSpan' => $span]);
                    $merged[$column]['rows']--;
                    if ($merged[$column]['rows'] <= 0) {
                        unset($merged[$column]);
                    }
                    $column += $span;

                    continue;
                }
                $cell = array_shift($queue);
                if ($cell === null) {
                    break;
                }
                $options = ['valign' => 'center'];
                if ($cell['span'] > 1) {
                    $options['gridSpan'] = $cell['span'];
                }
                if ($cell['rows'] > 1) {
                    $options['vMerge'] = 'restart';
                    $merged[$column] = ['rows' => $cell['rows'] - 1, 'span' => $cell['span']];
                }
                if ($cell['style'] === 'blue') {
                    $options['bgColor'] = self::BLUE;
                } elseif ($cell['style'] === 'shade') {
                    $options['bgColor'] = self::LIGHT_BLUE;
                }
                $font = [
                    'bold' => $cell['bold'],
                    'size' => $cell['small'] ? 7 : 9,
                    'color' => $cell['style'] === 'blue' ? 'FFFFFF' : '000000',
                ];
                $target = $row->addCell($this->width($widths, $column, $cell['span']), $options);
                $lines = preg_split('/\R/u', $cell['text']) ?: [''];
                foreach ($lines as $index => $line) {
                    // «ETIQUETA:» seguida de texto del docente: la etiqueta va en negrita.
                    $lineFont = $index === 0 && count($lines) > 1 && str_ends_with(trim($line), ':')
                        ? ['bold' => true] + $font
                        : $font;
                    $target->addText($line, $lineFont, ['spaceAfter' => 0, 'alignment' => $cell['center'] ? Jc::CENTER : Jc::START]);
                }
                $column += $cell['span'];
            }
        }
    }

    /** @param list<int> $widths */
    private function width(array $widths, int $from, int $span): int
    {
        return (int) array_sum(array_slice($widths, $from, $span));
    }

    /** @param array<string, mixed> $container */
    private function field(Section $section, array $container, ?string $number): void
    {
        $fields = $this->arrayList($container['fields'] ?? null);
        $field = $fields[0] ?? [];
        $label = $this->string($field['label'] ?? null, $this->string($container['title'] ?? null, 'Campo'));
        if ($number !== null) {
            $section->addText(
                $number.' '.$label,
                ['bold' => true, 'size' => 11],
                ['spaceBefore' => 160, 'spaceAfter' => 80, 'keepNext' => true],
            );
        }

        $contentType = $this->string($container['content_type'] ?? null, 'text');
        $rows = $this->arrayList($field['rows'] ?? null);

        // Bloque institucional: la ficha ya viene armada en la copia de la revisión.
        if ($contentType === 'institutional' || ($field['master_source'] ?? null) === 'asignaturas') {
            if (is_array($this->snapshotIdentification)) {
                $this->identification($section, IdentificationCard::grid($this->snapshotIdentification));

                return;
            }
        }

        if ($contentType === 'table' || ($rows !== [] && $contentType === 'text')) {
            $layout = is_array($container['table'] ?? null)
                ? TableLayout::normalize($container['table'])
                : TableLayout::default();
            $this->table($section, $layout, $rows);

            return;
        }

        if ($contentType === 'bulleted_list' || $contentType === 'numbered_list') {
            $style = $contentType === 'numbered_list' ? 'silabo-numbers' : 'silabo-bullets';
            if ($rows === []) {
                $section->addText('Sin contenido', ['italic' => true, 'color' => '595959']);
            }
            foreach ($rows as $row) {
                $section->addListItem($this->cell($this->rowData($row), 'texto'), 0, [], $style, ['spaceAfter' => 60]);
            }

            return;
        }

        $this->text($section, $field['value'] ?? null);
    }

    private function text(Section $section, mixed $value): void
    {
        $display = $this->display($value);
        if ($display === '') {
            $section->addText('Sin contenido', ['italic' => true, 'color' => '595959']);

            return;
        }

        foreach (preg_split('/\R/u', $display) ?: [] as $line) {
            $trimmed = trim($line);
            if ($trimmed === '') {
                continue;
            }
            if (preg_match('/^[-*•]\s+(.*)$/u', $trimmed, $match) === 1) {
                $section->addListItem($match[1], 0, [], 'silabo-bullets', ['spaceAfter' => 60]);

                continue;
            }
            $section->addText($trimmed);
        }
    }

    /**
     * @param  array{columns: list<array{key: string, label: string, type: string, group: string|null, band: string|null}>, groups: list<array{key: string, label: string}>, bands: list<array{key: string, label: string}>, header_fields: list<array{key: string, label: string}>, totals: array{enabled: bool, label: string}, repeat: array{enabled: bool, label: string}}  $layout
     * @param  list<array<string, mixed>>  $rows
     */
    private function table(Section $section, array $layout, array $rows): void
    {
        $units = $this->units($layout, $rows);
        foreach ($units as $index => $unit) {
            if ($index > 0) {
                $section->addTextBreak(1, [], ['spaceAfter' => 0]);
            }
            $table = $section->addTable([
                'borderSize' => 4,
                'borderColor' => self::BORDER,
                'cellMargin' => 60,
                'width' => 100 * 50,
                'unit' => TblWidth::PERCENT,
            ]);
            $widths = $this->widths($layout);
            $columnCount = count($layout['columns']);

            if ($layout['repeat']['enabled'] || $layout['header_fields'] !== []) {
                $header = $unit['header'];
                $labels = $layout['repeat']['enabled']
                    ? [[$layout['repeat']['label'].' No.', (string) ($index + 1)]]
                    : [];
                foreach ($layout['header_fields'] as $headerField) {
                    $labels[] = [$headerField['label'], $this->cell($header, $headerField['key'])];
                }
                foreach ($labels as [$label, $value]) {
                    $row = $table->addRow();
                    $row->addCell($widths[0], ['bgColor' => self::LIGHT_BLUE, 'gridSpan' => 1])
                        ->addText($label, ['bold' => true, 'size' => 9, 'color' => '1F497D'], ['spaceAfter' => 0]);
                    $cell = $row->addCell(self::CONTENT_WIDTH - $widths[0], ['gridSpan' => max(1, $columnCount - 1)]);
                    $cell->addText($value, ['size' => 9], ['spaceAfter' => 0]);
                }
            }

            $this->headerRows($table, $layout, $widths);

            foreach ($unit['rows'] as $rowIndex => $data) {
                $row = $table->addRow();
                $shade = $rowIndex % 2 === 1 ? self::LIGHT_BLUE : null;
                foreach ($layout['columns'] as $columnIndex => $column) {
                    $cell = $row->addCell($widths[$columnIndex], $shade !== null ? ['bgColor' => $shade] : []);
                    $cell->addText(
                        $this->cell($data, $column['key']),
                        ['size' => 9],
                        ['spaceAfter' => 0, 'alignment' => $column['type'] === 'number' ? Jc::CENTER : Jc::START],
                    );
                }
            }
            if ($unit['rows'] === []) {
                $row = $table->addRow();
                $row->addCell(self::CONTENT_WIDTH, ['gridSpan' => $columnCount])
                    ->addText('Sin filas', ['italic' => true, 'size' => 9, 'color' => '595959'], ['spaceAfter' => 0]);
            }

            if ($layout['totals']['enabled']) {
                $row = $table->addRow();
                foreach ($layout['columns'] as $columnIndex => $column) {
                    $cell = $row->addCell($widths[$columnIndex], ['bgColor' => self::LIGHT_BLUE]);
                    $text = $columnIndex === 0
                        ? $layout['totals']['label']
                        : ($column['type'] === 'number' ? $this->sum($unit['rows'], $column['key']) : '');
                    $cell->addText(
                        $text,
                        ['bold' => true, 'size' => 9, 'color' => '1F497D'],
                        ['spaceAfter' => 0, 'alignment' => $columnIndex === 0 ? Jc::END : Jc::CENTER],
                    );
                }
            }
        }
    }

    /**
     * Cabecera combinada: hasta tres filas (agrupamiento, grupo, columna). Cada
     * columna sabe en qué fila empieza su celda y cuántas ocupa; las vecinas del
     * mismo grupo se funden con `gridSpan`.
     *
     * @param  array{columns: list<array{key: string, label: string, type: string, group: string|null, band: string|null}>, groups: list<array{key: string, label: string}>, bands: list<array{key: string, label: string}>}  $layout
     * @param  list<int>  $widths
     */
    private function headerRows(Table $table, array $layout, array $widths): void
    {
        $columns = $layout['columns'];
        $hasBand = array_filter(array_column($columns, 'band')) !== [];
        $hasGroup = array_filter(array_column($columns, 'group')) !== [];
        $depth = 1 + ($hasBand ? 1 : 0) + ($hasGroup ? 1 : 0);
        $groupLabels = array_column($layout['groups'], 'label', 'key');
        $bandLabels = array_column($layout['bands'], 'label', 'key');

        /** @var list<list<array{id: string, label: string, span: int}|null>> $matrix fila => columna => celda */
        $matrix = array_fill(0, $depth, array_fill(0, count($columns), null));
        foreach ($columns as $index => $column) {
            $row = 0;
            if ($hasBand) {
                if ($column['band'] !== null) {
                    $matrix[0][$index] = ['id' => 'band:'.$column['band'], 'label' => $bandLabels[$column['band']] ?? '', 'span' => 1];
                    $row = 1;
                }
            }
            if ($hasGroup && $column['group'] !== null) {
                $span = ($hasBand && $column['band'] === null) ? 2 : 1;
                $matrix[$row][$index] = ['id' => 'group:'.$column['group'], 'label' => $groupLabels[$column['group']] ?? '', 'span' => $span];
                $row += $span;
            }
            $matrix[$row][$index] = ['id' => 'leaf:'.$column['key'], 'label' => $column['label'], 'span' => $depth - $row];
        }

        $style = ['bold' => true, 'size' => 9, 'color' => 'FFFFFF'];
        $paragraph = ['spaceAfter' => 0, 'alignment' => Jc::CENTER];
        for ($rowIndex = 0; $rowIndex < $depth; $rowIndex++) {
            $row = $table->addRow(null, ['tblHeader' => true]);
            $columnIndex = 0;
            while ($columnIndex < count($columns)) {
                $cell = $matrix[$rowIndex][$columnIndex];
                if ($cell === null) {
                    // Continuación vertical de una celda que empezó arriba.
                    $row->addCell($widths[$columnIndex], ['bgColor' => self::BLUE, 'vMerge' => 'continue']);
                    $columnIndex++;

                    continue;
                }
                $span = 1;
                $width = $widths[$columnIndex];
                while (
                    $columnIndex + $span < count($columns)
                    && ($matrix[$rowIndex][$columnIndex + $span]['id'] ?? null) === $cell['id']
                    && ! str_starts_with($cell['id'], 'leaf:')
                ) {
                    $width += $widths[$columnIndex + $span];
                    $span++;
                }
                $options = ['bgColor' => self::BLUE, 'valign' => 'center'];
                if ($span > 1) {
                    $options['gridSpan'] = $span;
                }
                if ($cell['span'] > 1) {
                    $options['vMerge'] = 'restart';
                    for ($extra = 1; $extra < $cell['span']; $extra++) {
                        for ($offset = 0; $offset < $span; $offset++) {
                            $matrix[$rowIndex + $extra][$columnIndex + $offset] = null;
                        }
                    }
                }
                $row->addCell($width, $options)->addText($cell['label'], $style, $paragraph);
                $columnIndex += $span;
            }
        }
    }

    /**
     * Filas agrupadas por unidad; la fila con `_kind = unit` trae la cabecera.
     *
     * @param  array{repeat: array{enabled: bool, label: string}}  $layout
     * @param  list<array<string, mixed>>  $rows
     * @return list<array{header: array<string, mixed>, rows: list<array<string, mixed>>}>
     */
    private function units(array $layout, array $rows): array
    {
        $units = [];
        foreach ($rows as $row) {
            $data = $this->rowData($row);
            $unit = $layout['repeat']['enabled'] ? max(1, (int) ($data['_unit'] ?? 1)) : 1;
            $units[$unit] ??= ['header' => [], 'rows' => []];
            if (($data['_kind'] ?? null) === 'unit') {
                $units[$unit]['header'] = $data;

                continue;
            }
            $units[$unit]['rows'][] = $data;
        }
        ksort($units);

        return $units === [] ? [['header' => [], 'rows' => []]] : array_values($units);
    }

    /**
     * @param  array{columns: list<array{type: string}>}  $layout
     * @return list<int>
     */
    private function widths(array $layout): array
    {
        $weights = array_map(fn (array $column): int => $column['type'] === 'number' ? 1 : 3, $layout['columns']);
        $total = max(1, array_sum($weights));

        return array_map(fn (int $weight): int => (int) floor(self::CONTENT_WIDTH * $weight / $total), $weights);
    }

    /** @param list<array<string, mixed>> $rows */
    private function sum(array $rows, string $key): string
    {
        $sum = 0.0;
        foreach ($rows as $row) {
            $value = $row[$key] ?? null;
            if (is_numeric($value)) {
                $sum += (float) $value;
            }
        }

        return $sum == floor($sum) ? (string) (int) $sum : rtrim(rtrim(number_format($sum, 2, '.', ''), '0'), '.');
    }

    /** @return array<string, mixed> */
    private function rowData(mixed $row): array
    {
        $data = is_array($row) ? ($row['data'] ?? $row) : null;

        return is_array($data) ? $data : [];
    }

    /** @param array<string, mixed> $data */
    private function cell(array $data, string $key): string
    {
        return $this->display($data[$key] ?? null);
    }

    private function display(mixed $value): string
    {
        if ($value === null || $value === '') {
            return '';
        }
        if (is_bool($value)) {
            return $value ? 'Sí' : 'No';
        }
        if (is_scalar($value)) {
            return trim((string) $value);
        }
        if (! is_array($value)) {
            return '';
        }
        $parts = [];
        foreach ($value as $item) {
            $parts[] = is_scalar($item) || $item === null
                ? (string) ($item ?? '')
                : (json_encode($item, JSON_UNESCAPED_UNICODE) ?: '');
        }

        return implode(', ', array_filter($parts, fn (string $part): bool => $part !== ''));
    }

    private function string(mixed $value, string $fallback): string
    {
        return is_string($value) && trim($value) !== '' ? trim($value) : $fallback;
    }

    /** @return list<array<string, mixed>> */
    private function arrayList(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        return array_values(array_filter($value, 'is_array'));
    }
}
