<?php

namespace App\Modules\Configuration\Application;

/** Sustituye referencias solo con valores de una fotografía, nunca consultando datos vivos. */
final class TemplateDocumentResolver
{
    /** @param array<string, mixed> $document
     * @param  list<array<string, mixed>>  $fields
     * @param  array<string, string>  $variables
     * @param  array<string, mixed>|null  $layout
     * @return array<string, mixed>
     */
    public static function resolve(array $document, array $fields, array $variables, ?array $layout): array
    {
        $byKey = array_column($fields, null, 'key');
        $visit = function (array $node, array $data = []) use (&$visit, $byKey, $variables, $layout): array {
            $type = $node['type'];
            $attrs = $node['attrs'] ?? [];
            if (in_array($type, ['variable', 'field', 'column'], true)) {
                $value = '';
                if ($type === 'variable') {
                    $value = $variables[$attrs['id']] ?? '';
                } elseif ($type === 'column') {
                    $value = self::display($data[$attrs['key']] ?? null);
                } else {
                    $field = $byKey[$attrs['key']] ?? [];
                    if (($attrs['listStyle'] ?? null) !== null) {
                        return [['type' => $attrs['listStyle'] === 'number' ? 'orderedList' : 'bulletList', 'content' => array_map(
                            fn ($row) => ['type' => 'listItem', 'content' => [['type' => 'paragraph', 'content' => [[
                                'type' => 'text', 'text' => self::display($row['data']['texto'] ?? ''), 'marks' => $node['marks'] ?? [],
                            ]]]]],
                            $field['rows'] ?? [],
                        )]];
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
