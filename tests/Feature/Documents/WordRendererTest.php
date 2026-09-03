<?php

namespace Tests\Feature\Documents;

use App\Modules\Documents\Domain\Contracts\DocumentRenderer;
use App\Modules\Documents\Domain\Data\DocumentRenderInput;
use App\Modules\Documents\Infrastructure\Rendering\PhpWordDocumentRenderer;
use Tests\TestCase;
use ZipArchive;

/** I-34: el DOCX reproduce tablas complejas (agrupaciones, unidades, totales) y es reproducible. */
class WordRendererTest extends TestCase
{
    public function test_renders_grouped_headers_units_and_totals_deterministically(): void
    {
        $renderer = app(DocumentRenderer::class);
        $this->assertInstanceOf(PhpWordDocumentRenderer::class, $renderer);

        $input = new DocumentRenderInput(
            subject: 'Inteligencia Artificial',
            subjectCode: 'SW-P7-037',
            academicPeriod: 'Marzo – Julio 2026',
            revisionNumber: 3,
            revisionFingerprint: str_repeat('ab', 32),
            templateId: '01a064a5-1d6d-7196-b189-05376ff0929d',
            generatedAt: '2026-09-02T20:00:00-05:00',
            locale: 'es-EC',
            snapshot: $this->snapshot(),
        );

        $first = $renderer->render($input);
        $second = $renderer->render($input);
        $this->assertSame($first->docx->fingerprint(), $second->docx->fingerprint());
        $this->assertSame($first->pdf->fingerprint(), $second->pdf->fingerprint());

        $temporary = tempnam(sys_get_temp_dir(), 'silabos-test-');
        $this->assertNotFalse($temporary);
        file_put_contents($temporary, $first->docx->bytes);
        $zip = new ZipArchive;
        $this->assertTrue($zip->open($temporary) === true);
        $document = $zip->getFromName('word/document.xml');
        $zip->close();
        @unlink($temporary);
        $this->assertIsString($document);

        // Bloque y campo numerados, metadatos y texto libre.
        $this->assertStringContainsString('1. Unidades y planificación', $document);
        $this->assertStringContainsString('1.1 Planificación', $document);
        $this->assertStringContainsString('2.1 Descripción', $document);
        $this->assertStringContainsString('Descripción libre', $document);
        $this->assertStringContainsString(str_repeat('ab', 32), $document);

        // Cabecera combinada: agrupamiento de cuatro columnas y grupo de dos.
        $this->assertStringContainsString('Horas por semana', $document);
        $this->assertStringContainsString('<w:gridSpan w:val="4"/>', $document);
        $this->assertStringContainsString('<w:gridSpan w:val="2"/>', $document);
        $this->assertStringContainsString('<w:vMerge w:val="restart"/>', $document);
        $this->assertStringContainsString('<w:vMerge w:val="continue"/>', $document);

        // Dos unidades con su cabecera y totales sumados por unidad.
        $this->assertSame(2, substr_count($document, 'Unidad No.'));
        $this->assertStringContainsString('Fundamentos teóricos', $document);
        $this->assertStringContainsString('Aprendizaje automático', $document);
        $this->assertSame(2, substr_count($document, 'Total, horas'));
        $this->assertStringContainsString('>4<', $document);
        $this->assertStringContainsString('>2.5<', $document);

        // Lista con viñetas del segundo bloque.
        $this->assertStringContainsString('Primer objetivo', $document);
        $this->assertStringContainsString('<w:numPr>', $document);
    }

    /** @return array<string, mixed> */
    private function snapshot(): array
    {
        $table = [
            'columns' => [
                ['key' => 'contenidos', 'label' => 'Contenidos temáticos', 'type' => 'text'],
                ['key' => 'semana', 'label' => 'Semanas', 'type' => 'number', 'band' => 'horas'],
                ['key' => 'acd', 'label' => 'ACD', 'type' => 'number', 'group' => 'docencia', 'band' => 'horas'],
                ['key' => 'ape', 'label' => 'APE', 'type' => 'number', 'group' => 'estudiante', 'band' => 'horas'],
                ['key' => 'aa', 'label' => 'AA', 'type' => 'number', 'group' => 'estudiante', 'band' => 'horas'],
                ['key' => 'evaluacion', 'label' => 'Evaluación', 'type' => 'text'],
            ],
            'groups' => [
                ['key' => 'docencia', 'label' => 'Docencia'],
                ['key' => 'estudiante', 'label' => 'Estudiante'],
            ],
            'bands' => [['key' => 'horas', 'label' => 'Horas por semana']],
            'header_fields' => [['key' => 'nombre', 'label' => 'Nombre de la unidad']],
            'totals' => ['enabled' => true, 'label' => 'Total, horas'],
            'repeat' => ['enabled' => true, 'label' => 'Unidad'],
        ];
        $rows = [
            ['data' => ['_unit' => 1, '_kind' => 'unit', 'nombre' => 'Fundamentos teóricos']],
            ['data' => ['_unit' => 1, 'contenidos' => 'Socialización', 'semana' => 1, 'acd' => 2, 'ape' => 1, 'aa' => 3, 'evaluacion' => 'Ficha']],
            ['data' => ['_unit' => 1, 'contenidos' => 'Conceptos', 'semana' => 2, 'acd' => 2, 'ape' => 1, 'aa' => 3, 'evaluacion' => 'Ficha']],
            ['data' => ['_unit' => 2, '_kind' => 'unit', 'nombre' => 'Aprendizaje automático']],
            ['data' => ['_unit' => 2, 'contenidos' => 'Regresión', 'semana' => 5, 'acd' => '1.5', 'ape' => 1, 'aa' => 3, 'evaluacion' => 'Rúbrica']],
            ['data' => ['_unit' => 2, 'contenidos' => 'Clasificación', 'semana' => 6, 'acd' => 1, 'ape' => 1, 'aa' => 3, 'evaluacion' => 'Rúbrica']],
        ];

        return [
            'schema_version' => 2,
            'template_id' => '01a064a5-1d6d-7196-b189-05376ff0929d',
            'sections' => [
                [
                    'key' => 'unidades',
                    'title' => 'Unidades y planificación',
                    'blocks' => [[
                        'key' => 'unidades_principal',
                        'title' => 'Planificación',
                        'content_type' => 'table',
                        'table' => $table,
                        'fields' => [['key' => 'planificacion', 'label' => 'Planificación', 'type' => 'repetible', 'value' => null, 'rows' => $rows]],
                    ]],
                ],
                [
                    'key' => 'descripcion',
                    'title' => 'Descripción de la asignatura',
                    'blocks' => [
                        [
                            'key' => 'descripcion_principal',
                            'title' => 'Descripción',
                            'content_type' => 'text',
                            'table' => null,
                            'fields' => [['key' => 'descripcion', 'label' => 'Descripción', 'type' => 'markdown', 'value' => "Descripción libre\n- Punto uno", 'rows' => []]],
                        ],
                        [
                            'key' => 'objetivos',
                            'title' => 'Objetivos',
                            'content_type' => 'bulleted_list',
                            'table' => null,
                            'fields' => [['key' => 'objetivos', 'label' => 'Objetivos', 'type' => 'repetible', 'value' => null, 'rows' => [
                                ['data' => ['texto' => 'Primer objetivo']],
                                ['data' => ['texto' => 'Segundo objetivo']],
                            ]]],
                        ],
                    ],
                ],
            ],
        ];
    }
}
