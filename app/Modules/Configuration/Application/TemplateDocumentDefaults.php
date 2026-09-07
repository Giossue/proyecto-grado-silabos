<?php

namespace App\Modules\Configuration\Application;

use App\Modules\Syllabus\Application\IdentificationCard;

/** Adaptación de la ficha histórica; solo crea la propuesta, nunca escribe al leer. */
final class TemplateDocumentDefaults
{
    /** @return array<string, mixed> */
    public static function identification(): array
    {
        $data = IdentificationCard::sample();
        foreach (TemplateVariables::definitions() as $key => $definition) {
            if (! isset($definition['equals']) && str_starts_with($definition['source'], 'identification.')) {
                $data[substr($definition['source'], 15)] = '[[variable:'.$key.']]';
            }
        }
        $data['disability_type'] = '[[field:discapacidad_tipo]]';
        $data['disability_description'] = '[[field:discapacidad_adaptacion]]';
        $data['formation'] = '[[field:formacion_experiencia]]';
        $grid = IdentificationCard::grid($data);
        $labels = [
            'discapacidad_tiene' => ['Estudiantes con discapacidad', 'seleccion_unica'],
            'discapacidad_tipo' => ['Tipo de discapacidad', 'texto_corto'],
            'discapacidad_adaptacion' => ['Adaptación curricular', 'texto_corto'],
            'formacion_experiencia' => ['Formación y experiencia', 'markdown'],
        ];
        $rows = [];
        foreach ($grid as $r => $cells) {
            $row = ['type' => 'tableRow', 'attrs' => ['rowRole' => 'fixed'], 'content' => []];
            foreach ($cells as $c => $cell) {
                $cell['text'] = match (true) {
                    $r === 6 && $c === array_key_last($cells) => '[[variable:marca_unidad_basica]]',
                    $r === 7 && $c === array_key_last($cells) => '[[variable:marca_unidad_profesional]]',
                    $r === 8 && $c === array_key_last($cells) => '[[variable:marca_unidad_titulacion]]',
                    $r === 9 && $c === 2 => '[[field:discapacidad_tiene:Sí]]',
                    $r === 11 && $c === 1 => '[[field:discapacidad_tiene:No]]',
                    default => $cell['text'],
                };
                $marks = [['type' => 'textStyle', 'attrs' => ['fontSize' => $cell['small'] ? '7pt' : '9pt', 'color' => $cell['style'] === 'blue' ? '#FFFFFF' : '#000000']]];
                if ($cell['bold']) {
                    $marks[] = ['type' => 'bold'];
                }
                $paragraphs = [];
                foreach (explode("\n", $cell['text']) as $line) {
                    $content = [];
                    foreach (preg_split('/(\[\[(?:variable|field):[^\]]+\]\])/', $line, -1, PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY) ?: [] as $part) {
                        if (preg_match('/^\[\[(variable|field):([^:\]]+)(?::([^\]]+))?\]\]$/', $part, $matches)) {
                            $key = $matches[2];
                            $attrs = $matches[1] === 'variable'
                                ? ['id' => $key, 'label' => $key]
                                : ['key' => $key, 'label' => $labels[$key][0], 'kind' => $labels[$key][1], 'choice' => $matches[3] ?? null];
                            $content[] = ['type' => $matches[1], 'attrs' => $attrs, 'marks' => $marks];
                        } else {
                            $content[] = ['type' => 'text', 'text' => $part, 'marks' => $marks];
                        }
                    }
                    $paragraphs[] = ['type' => 'paragraph', 'attrs' => ['textAlign' => $cell['center'] ? 'center' : 'left'], 'content' => $content];
                }
                $row['content'][] = ['type' => 'tableCell', 'attrs' => [
                    'colspan' => $cell['span'], 'rowspan' => $cell['rows'], 'colwidth' => $r === 0 ? array_map(fn ($weight) => (int) round(625 * $weight / array_sum(IdentificationCard::WIDTHS)), IdentificationCard::WIDTHS) : null,
                    'backgroundColor' => match ($cell['style']) {
                        'blue' => '#4F81BD', 'shade' => '#DBE5F1', default => null
                    },
                ], 'content' => $paragraphs];
            }
            $rows[] = $row;
        }

        return ['type' => 'doc', 'content' => [['type' => 'table', 'attrs' => ['repeatKey' => null], 'content' => $rows]]];
    }
}
