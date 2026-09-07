<?php

namespace App\Modules\Documents\Infrastructure\Rendering;

use PhpOffice\PhpWord\Element\AbstractContainer;
use PhpOffice\PhpWord\SimpleType\TblWidth;

/** Renderiza el contrato validado; no importa HTML, recursos remotos ni estilos arbitrarios. */
final class TemplateDocumentWord
{
    public function __construct(
        private readonly ?string $paragraphAlignment = null,
        private readonly ?string $tableHeaderBackground = null,
        private readonly ?string $tableHeaderColor = null,
    ) {}

    /** @param array<string, mixed> $node */
    public function append(AbstractContainer $target, array $node, int $width = 9406, ?string $list = null): void
    {
        if ($node['type'] === 'table') {
            $this->table($target, $node, $width);

            return;
        }
        if ($node['type'] === 'paragraph') {
            $alignment = $this->paragraphAlignment ?? ($node['attrs']['textAlign'] ?? 'left');
            $style = ['spaceAfter' => 80, 'alignment' => $alignment === 'justify' ? 'both' : $alignment];
            if ($list !== null) {
                $style['numStyle'] = $list;
                $style['numLevel'] = 0;
            }
            $run = $target->addTextRun($style);
            foreach ($node['content'] ?? [] as $text) {
                if ($text['type'] === 'hardBreak') {
                    $run->addTextBreak();

                    continue;
                }
                $font = [];
                foreach ($text['marks'] ?? [] as $mark) {
                    if (in_array($mark['type'], ['bold', 'italic'], true)) {
                        $font[$mark['type']] = true;
                    } elseif ($mark['type'] === 'underline') {
                        $font['underline'] = 'single';
                    } elseif ($mark['type'] === 'textStyle') {
                        $attrs = $mark['attrs'];
                        if (isset($attrs['color'])) {
                            $font['color'] = ltrim($attrs['color'], '#');
                        }
                        if (isset($attrs['fontFamily'])) {
                            $font['name'] = $attrs['fontFamily'];
                        }
                        if (isset($attrs['fontSize'])) {
                            $font['size'] = (int) $attrs['fontSize'];
                        }
                    }
                }
                $lines = explode("\n", $text['text'] ?? '');
                foreach ($lines as $index => $line) {
                    if ($index > 0) {
                        $run->addTextBreak();
                    }
                    $run->addText($line, $font);
                }
            }

            return;
        }
        $list = match ($node['type']) {
            'bulletList' => 'silabo-bullets', 'orderedList' => 'silabo-numbers', default => $list
        };
        foreach ($node['content'] ?? [] as $child) {
            $this->append($target, $child, $width, $list);
        }
    }

    /** @param array<string, mixed> $node */
    private function table(AbstractContainer $target, array $node, int $width): void
    {
        $rows = $node['content'];
        $count = array_sum(array_map(fn ($cell) => $cell['attrs']['colspan'] ?? 1, $rows[0]['content']));
        $weights = array_fill(0, $count, 100);
        $occupied = [];
        foreach ($rows as $r => $row) {
            $column = 0;
            foreach ($row['content'] as $cell) {
                while (isset($occupied[$r][$column])) {
                    $column++;
                }
                $span = $cell['attrs']['colspan'] ?? 1;
                for ($c = 0; $c < $span; $c++) {
                    if (($cell['attrs']['colwidth'][$c] ?? 0) > 0) {
                        $weights[$column + $c] = $cell['attrs']['colwidth'][$c];
                    }
                    for ($y = 1; $y < ($cell['attrs']['rowspan'] ?? 1); $y++) {
                        $occupied[$r + $y][$column + $c] = true;
                    }
                }
                $column += $span;
            }
        }
        $widths = array_map(fn ($weight) => (int) round($width * $weight / array_sum($weights)), $weights);
        $table = $target->addTable(['borderSize' => 4, 'borderColor' => '7F7F7F', 'cellMargin' => 50, 'width' => 5000, 'unit' => TblWidth::PERCENT]);
        $merged = [];
        foreach ($rows as $rowIndex => $source) {
            $role = $source['attrs']['rowRole'] ?? null;
            $isHeader = in_array($role, ['fixed', 'unit'], true)
                || ($role === null && $rowIndex === 0);
            $row = $table->addRow();
            $cells = $source['content'];
            $column = 0;
            while ($column < $count) {
                if (isset($merged[$column])) {
                    $merge = $merged[$column];
                    $row->addCell((int) array_sum(array_slice($widths, $column, $merge['span'])), ['vMerge' => 'continue', 'gridSpan' => $merge['span']]);
                    if (--$merged[$column]['rows'] === 0) {
                        unset($merged[$column]);
                    }
                    $column += $merge['span'];

                    continue;
                }
                $cell = array_shift($cells);
                if ($cell === null) {
                    break;
                }
                $attrs = $cell['attrs'];
                $span = $attrs['colspan'] ?? 1;
                $height = $attrs['rowspan'] ?? 1;
                $cellWidth = (int) array_sum(array_slice($widths, $column, $span));
                $options = ['gridSpan' => $span, 'valign' => 'center'];
                if ($height > 1) {
                    $options['vMerge'] = 'restart';
                    $merged[$column] = ['span' => $span, 'rows' => $height - 1];
                }
                if (($attrs['backgroundColor'] ?? null) !== null) {
                    $options['bgColor'] = ltrim($attrs['backgroundColor'], '#');
                }
                if ($isHeader && $this->tableHeaderBackground !== null) {
                    $options['bgColor'] = $this->tableHeaderBackground;
                }
                $destination = $row->addCell($cellWidth, $options);
                foreach ($cell['content'] as $child) {
                    $this->append(
                        $destination,
                        $isHeader && $this->tableHeaderColor !== null
                            ? $this->withTextColor($child, $this->tableHeaderColor)
                            : $child,
                        $cellWidth,
                    );
                }
                $column += $span;
            }
        }
    }

    /**
     * @param  array<string, mixed>  $node
     * @return array<string, mixed>
     */
    private function withTextColor(array $node, string $color): array
    {
        if ($node['type'] === 'text') {
            $marks = $node['marks'] ?? [];
            $hasTextStyle = false;
            foreach ($marks as $index => $mark) {
                if ($mark['type'] !== 'textStyle') {
                    continue;
                }

                $marks[$index]['attrs'] = [
                    ...($mark['attrs'] ?? []),
                    'color' => '#'.$color,
                ];
                $hasTextStyle = true;
            }
            if (! $hasTextStyle) {
                $marks[] = ['type' => 'textStyle', 'attrs' => ['color' => '#'.$color]];
            }
            $node['marks'] = $marks;
        }

        if (is_array($node['content'] ?? null)) {
            $node['content'] = array_map(
                fn (array $child): array => $this->withTextColor($child, $color),
                $node['content'],
            );
        }

        return $node;
    }
}
