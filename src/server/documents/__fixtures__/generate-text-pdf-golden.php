<?php

$backend = $argv[1] ?? '';
$output = $argv[2] ?? __DIR__.'/laravel-text-pdf-golden.json';
require $backend.'/vendor/autoload.php';
$app = require $backend.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Modules\Documents\Application\SyllabusDocumentContent;
use App\Modules\Documents\Domain\Data\DocumentRenderInput;
use App\Modules\Documents\Infrastructure\Rendering\PlainTextPdf;

$word = json_decode(file_get_contents(__DIR__.'/laravel-word-golden.json'), true);
$doc = fn (string $text) => ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => $text]]]]];
$blocks = [
    ['key' => 'b1', 'title' => 'Bloques antiguos', 'fields' => [], 'blocks' => [
        ['title' => 'Datos', 'fields' => [
            ['label' => 'Horas', 'value' => 48],
            ['label' => ' Activo ', 'value' => true],
            ['label' => 'Inactivo', 'value' => false],
            ['label' => '', 'value' => null],
            ['label' => 'Vacío', 'value' => ''],
            ['label' => 'Oculto', 'value' => 'secreto', 'hidden' => true],
            ['label' => 'Texto', 'value' => '  con espacios  '],
            ['label' => 'Documento', 'value' => $doc('Contenido del documento')],
            ['label' => 'Lista', 'value' => ['uno', 2, null, 'dos_tres' => 'x']],
            ['label' => 'Decimal', 'value' => 1.5],
        ]],
        ['fields' => []],
        ['title' => 'Con documento', 'document' => ['type' => 'doc', 'content' => [
            ['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Primer '], ['type' => 'text', 'text' => 'párrafo']]],
            ['type' => 'paragraph'],
            ['type' => 'bulletList', 'content' => [['type' => 'listItem', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Viñeta']]]]]]],
        ]]],
    ]],
];
$cases = [];
foreach ([...$word['cases'], ['name' => 'bloques', 'document' => [], 'snapshot' => ['sections' => $blocks]]] as $case) {
    $snapshot = [
        ...$case['snapshot'],
        'template_definition' => [...$word['definition'], 'document' => array_replace_recursive($word['definition']['document'], $case['document'])],
        'template_variables' => $word['template_variables'],
    ];
    if (array_key_exists('header', $case['document'])) {
        $snapshot['template_definition']['document']['header'] = $case['document']['header'];
    }
    $input = new DocumentRenderInput('Biología', 'C2', '2026-2', 2, str_repeat('ab', 32), '2026-11-24T15:30:00+00:00', 'es-EC', $snapshot);
    $lines = app(SyllabusDocumentContent::class)->lines($input);
    $cases[] = ['name' => $case['name'], 'lines' => $lines, 'pdf' => base64_encode(app(PlainTextPdf::class)->write($lines))];
}
if (end($cases)['name'] === 'bloques') {
    $cases[count($cases) - 1]['snapshot'] = ['sections' => $blocks];
}

$stress = [
    [],
    [''],
    ['Una línea corta', '', 'Otra (con paréntesis) y \\ barra'],
    [str_repeat('palabra ', 30), str_repeat('x', 100).' fin', 'a '.str_repeat('y', 95).' b', str_repeat('ñ', 60).' '.str_repeat('é', 40)],
    ["salto\ninterno con texto largo ".str_repeat('z ', 50), "tab\tretorno\rnulo\x00vt\x0Bff\x0Cesc\x1Bfin"],
    ['€ 😀 Ω é ñ ü — “comillas” ‘simples’ … • ™ œ Ÿ', "\u{81}\u{80}\u{9D}"],
    array_map(fn (int $index): string => "Línea {$index}", range(1, 120)),
    [str_repeat('  ', 50).'sangría', ' '.str_repeat('w', 92).' ', str_repeat('q', 92).' '.str_repeat('r', 92)],
];
$pdf = app(PlainTextPdf::class);
$raw = array_map(fn (array $lines): array => ['lines' => $lines, 'pdf' => base64_encode($pdf->write($lines))], $stress);

file_put_contents($output, json_encode(['cases' => $cases, 'raw' => $raw], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION)."\n");
