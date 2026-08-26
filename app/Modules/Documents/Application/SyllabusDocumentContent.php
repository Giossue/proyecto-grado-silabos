<?php

namespace App\Modules\Documents\Application;

use App\Modules\Documents\Domain\Data\DocumentRenderInput;

class SyllabusDocumentContent
{
    /** @return list<string> */
    public function lines(DocumentRenderInput $input): array
    {
        $lines = [
            'SÍLABO ACADÉMICO — FORMATO TÉCNICO PROVISIONAL',
            $input->subject.' ('.$input->subjectCode.')',
            'Periodo: '.$input->academicPeriod,
            'Revisión: '.$input->revisionNumber,
            'Huella de revisión: '.$input->revisionFingerprint,
            'Generado: '.$input->generatedAt,
            '',
        ];

        foreach ($this->arrayList($input->snapshot['sections'] ?? null) as $section) {
            $lines[] = $this->string($section['title'] ?? null, 'Sección');
            foreach ($this->arrayList($section['blocks'] ?? null) as $block) {
                $lines[] = '  '.$this->string($block['title'] ?? null, 'Bloque');
                foreach ($this->arrayList($block['fields'] ?? null) as $field) {
                    $label = $this->string($field['label'] ?? null, 'Campo');
                    $rows = $this->arrayList($field['rows'] ?? null);
                    if ($rows === []) {
                        $lines[] = '    '.$label.': '.$this->display($field['value'] ?? null);

                        continue;
                    }
                    $lines[] = '    '.$label.':';
                    foreach ($rows as $index => $row) {
                        $lines[] = '      '.($index + 1).'. '.$this->display($row['data'] ?? null);
                    }
                }
            }
            $lines[] = '';
        }

        return $lines;
    }

    private function display(mixed $value): string
    {
        if ($value === null || $value === '') {
            return 'Sin contenido';
        }
        if (is_bool($value)) {
            return $value ? 'Sí' : 'No';
        }
        if (is_scalar($value)) {
            return trim((string) $value);
        }
        if (! is_array($value)) {
            return 'Contenido estructurado';
        }

        $parts = [];
        foreach ($value as $key => $item) {
            $display = is_scalar($item) || $item === null
                ? (string) ($item ?? '—')
                : json_encode($item, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $parts[] = is_string($key) ? str_replace('_', ' ', $key).': '.$display : $display;
        }

        return implode(' · ', $parts);
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

        return array_values(array_filter($value, is_array(...)));
    }
}
