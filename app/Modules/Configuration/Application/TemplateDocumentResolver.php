<?php

namespace App\Modules\Configuration\Application;

use App\Modules\Configuration\Domain\TableLayout;

/** Sustituye referencias solo con valores de una fotografía, nunca consultando datos vivos. */
final class TemplateDocumentResolver
{
    /** @param array<string, mixed> $document
     * @param  list<array<string, mixed>>  $fields
     * @param  array<string, string>  $variables
     * @param  array<string, mixed>|null  $layout
     * @param  array<string, mixed>|null  $planningExpectations
     * @return array<string, mixed>
     */
    public static function resolve(array $document, array $fields, array $variables, ?array $layout, ?array $planningExpectations = null): array
    {
        $byKey = array_column($fields, null, 'key');
        $visit = function (array $node, array $data = []) use (&$visit, $byKey, $variables, $layout, $planningExpectations): array {
            $type = $node['type'];
            $attrs = $node['attrs'] ?? [];
            if (in_array($type, ['variable', 'field', 'column'], true)) {
                $value = '';
                if ($type === 'variable') {
                    $value = $variables[$attrs['id']] ?? '';
                } elseif ($type === 'column') {
                    $value = self::display($data[$attrs['key']] ?? null);
                    if (($attrs['listStyle'] ?? null) !== null) {
                        return [self::listNode($node, preg_split('/\R/u', $value) ?: [])];
                    }
                } else {
                    $field = $byKey[$attrs['key']] ?? [];
                    if (($attrs['listStyle'] ?? null) !== null) {
                        $items = ($field['type'] ?? null) === 'repetible' || ($field['rows'] ?? []) !== []
                            ? array_map(fn ($row) => self::display($row['data']['texto'] ?? ''), $field['rows'] ?? [])
                            : (preg_split('/\R/u', self::display($field['value'] ?? null)) ?: []);

                        return [self::listNode($node, array_values($items))];
                    }
                    $value = self::display($field['value'] ?? null);
                    if (($field['rows'] ?? []) !== []) {
                        $value = implode("\n", array_map(fn ($row) => self::display($row['data']['texto'] ?? ''), $field['rows']));
                    }
                    if (($attrs['choice'] ?? null) !== null) {
                        $value = $value === $attrs['choice'] ? 'X' : '';
                    }
                }

                return [['type' => 'text', 'text' => $value, 'marks' => $node['marks'] ?? []]];
            }
            if ($type === 'table' && ($attrs['repeatKey'] ?? null) !== null && $layout !== null) {
                $field = $byKey[$attrs['repeatKey']] ?? [];
                $units = [];
                foreach ($field['rows'] ?? [] as $row) {
                    $rowData = is_array($row['data'] ?? null) ? $row['data'] : [];
                    $unit = $layout['repeat']['enabled'] ? max(1, (int) ($rowData['_unit'] ?? 1)) : 1;
                    $units[$unit] ??= ['header' => [], 'rows' => []];
                    if (($rowData['_kind'] ?? '') === 'unit') {
                        $units[$unit]['header'] = $rowData;
                    } else {
                        $units[$unit]['rows'][] = $rowData;
                    }
                }
                ksort($units);
                $result = [];
                foreach ($units ?: [1 => ['header' => [], 'rows' => []]] as $number => $unit) {
                    if ($result !== []) {
                        $result[] = ['type' => 'pageBreak'];
                    }
                    if ($layout['repeat']['enabled']) {
                        $result[] = ['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => $layout['repeat']['label'].' '.$number, 'marks' => [['type' => 'bold']]]]];
                    }
                    $totals = [];
                    foreach ($layout['columns'] as $column) {
                        if ($column['type'] === 'number' && ($column['sum'] ?? true)) {
                            $sum = array_sum(array_map(fn ($row) => is_numeric($row[$column['key']] ?? null) ? (float) $row[$column['key']] : 0, $unit['rows']));
                            $totals[$column['key']] = rtrim(rtrim(number_format($sum, 2, '.', ''), '0'), '.');
                        }
                    }
                    $expanded = [];
                    $rows = $node['content'];
                    for ($index = 0; $index < count($rows); $index++) {
                        $role = $rows[$index]['attrs']['rowRole'] ?? 'fixed';
                        if ($role === 'record') {
                            $group = [$rows[$index]];
                            while (($rows[$index + 1]['attrs']['rowRole'] ?? null) === 'record') {
                                $group[] = $rows[++$index];
                            }
                            foreach ($unit['rows'] ?: [[]] as $record) {
                                foreach ($group as $row) {
                                    $expanded = [...$expanded, ...$visit($row, $record)];
                                }
                            }
                        } else {
                            $expanded = [...$expanded, ...$visit($rows[$index], $role === 'total' ? $totals : $unit['header'])];
                        }
                    }
                    $result[] = ['type' => 'table', 'attrs' => ['repeatKey' => null], 'content' => $expanded];
                }
                if (TableLayout::isPlanning($layout)) {
                    $result = [...$result, ...self::planningSummaryNodes($layout, $field['rows'] ?? [], $planningExpectations ?? [])];
                }

                return $result;
            }
            if (isset($node['content'])) {
                $children = [];
                foreach ($node['content'] as $child) {
                    $children = [...$children, ...$visit($child, $data)];
                }
                $node['content'] = $children;
                if ($type === 'paragraph') {
                    $parts = [];
                    $inline = [];
                    foreach ($children as $child) {
                        if (in_array($child['type'], ['bulletList', 'orderedList'], true)) {
                            if ($inline !== []) {
                                $parts[] = [...$node, 'content' => $inline];
                                $inline = [];
                            }
                            $parts[] = $child;
                        } else {
                            $inline[] = $child;
                        }
                    }
                    if ($parts !== []) {
                        if ($inline !== []) {
                            $parts[] = [...$node, 'content' => $inline];
                        }

                        return $parts;
                    }
                }
            }

            return [$node];
        };

        return $visit($document)[0];
    }

    /**
     * @param  array<string, mixed>  $layout
     * @param  list<array<string, mixed>>  $rows
     * @param  array<string, mixed>  $expected
     * @return list<array<string, mixed>>
     */
    private static function planningSummaryNodes(array $layout, array $rows, array $expected): array
    {
        $columns = TableLayout::columnsByRole($layout);
        $totals = ['hours_acd' => 0.0, 'hours_ape' => 0.0, 'hours_aa' => 0.0];
        $weeks = [];
        foreach ($rows as $row) {
            $data = is_array($row['data'] ?? null) ? $row['data'] : [];
            if (($data['_kind'] ?? null) === 'unit') {
                continue;
            }
            if (is_numeric($data[$columns['week']] ?? null)) {
                $weeks[] = (int) $data[$columns['week']];
            }
            foreach (array_keys($totals) as $role) {
                if (is_numeric($data[$columns[$role]] ?? null)) {
                    $totals[$role] += (float) $data[$columns[$role]];
                }
            }
        }
        $display = fn (float $value): string => rtrim(rtrim(number_format($value, 2, '.', ''), '0'), '.');
        $headers = ['Semanas', 'ACD', 'APE', 'AA', 'Créditos (malla)'];
        $values = [
            count(array_unique($weeks)).'/'.($expected['teaching_weeks'] ?? '—'),
            $display($totals['hours_acd']).'/'.($expected['hours_acd'] ?? '—'),
            $display($totals['hours_ape']).'/'.($expected['hours_ape'] ?? '—'),
            $display($totals['hours_aa']).'/'.($expected['hours_aa'] ?? '—'),
            (string) ($expected['credits'] ?? '—'),
        ];
        $row = fn (string $type, array $items): array => [
            'type' => 'tableRow',
            'content' => array_map(fn (string $text): array => [
                'type' => $type,
                'attrs' => ['colspan' => 1, 'rowspan' => 1, 'colwidth' => [100]],
                'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => $text]]]],
            ], $items),
        ];

        return [
            ['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Resumen general de planificación', 'marks' => [['type' => 'bold']]]]],
            ['type' => 'table', 'attrs' => ['repeatKey' => null], 'content' => [
                $row('tableHeader', $headers),
                $row('tableCell', $values),
            ]],
        ];
    }

    /** @param array<string, mixed> $node
     * @param  list<string>  $items
     * @return array<string, mixed>
     */
    private static function listNode(array $node, array $items): array
    {
        return ['type' => $node['attrs']['listStyle'] === 'number' ? 'orderedList' : 'bulletList', 'content' => array_values(array_map(
            fn ($text) => ['type' => 'listItem', 'content' => [['type' => 'paragraph', 'content' => [[
                'type' => 'text', 'text' => $text, 'marks' => $node['marks'] ?? [],
            ]]]]],
            array_filter($items, fn ($item) => trim($item) !== ''),
        ))];
    }

    public static function display(mixed $value): string
    {
        if (is_bool($value)) {
            return $value ? 'Sí' : 'No';
        }
        if (is_scalar($value)) {
            return (string) $value;
        }
        if (is_array($value)) {
            return implode(' · ', array_map(self::display(...), $value));
        }

        return '';
    }
}
