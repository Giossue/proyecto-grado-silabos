<?php
$backend = $argv[1] ?? '';
require $backend.'/vendor/autoload.php';
$app = require $backend.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Modules\Configuration\Application\TemplateContext;
use App\Modules\Configuration\Application\TemplateVariables;
use App\Modules\Configuration\Domain\TemplateDefinition;
use App\Modules\Documents\Domain\Data\DocumentRenderInput;
use App\Modules\Documents\Domain\SignatureAnchor;
use App\Modules\Documents\Infrastructure\Rendering\PhpWordDocumentRenderer;

$golden = json_decode(file_get_contents(__DIR__.'/../../configuration/__fixtures__/template-golden.json'), true);
$definition = $golden['definition'];
$image = function (string $type, int $width, int $height, array $rgb): string {
    $canvas = imagecreatetruecolor($width, $height);
    imagefill($canvas, 0, 0, imagecolorallocate($canvas, ...$rgb));
    ob_start();
    match ($type) {
        'png' => imagepng($canvas),
        'jpeg' => imagejpeg($canvas, null, 90),
        'gif' => imagegif($canvas),
    };
    return base64_encode((string) ob_get_clean());
};
$logos = [
    'png_wide' => $image('png', 160, 30, [20, 60, 140]),
    'png_square' => $image('png', 40, 40, [200, 30, 30]),
    'jpeg' => $image('jpeg', 90, 30, [10, 120, 10]),
    'gif' => $image('gif', 60, 20, [250, 200, 0]),
];
$sections = [];
foreach ($golden['fields'] as $index => $field) {
    $key = $field['section'];
    $sections[$key] ??= ['key' => $key, 'title' => $field['section_title'], 'orientation' => $key === 'planificacion' ? 'landscape' : 'portrait', 'fields' => []];
    $sections[$key]['fields'][] = [
        'definition_id' => sprintf('01a1c5ba-0000-7000-8000-%012d', $index + 1),
        'key' => $field['key'],
        'label' => $field['label'],
        'quien_llena' => $field['quien_llena'],
        'document' => $field['content'],
    ];
}
$sections = array_values($sections);
$t = fn (string $text, array $marks = []) => array_filter(['type' => 'text', 'text' => $text, 'marks' => $marks ?: null]);
$p = fn (array $content, array $attrs = []) => array_filter(['type' => 'paragraph', 'attrs' => $attrs ?: null, 'content' => $content]);
$li = fn (array ...$content) => ['type' => 'listItem', 'content' => $content];
$cell = fn (string $type, array $attrs, array $content) => ['type' => $type, 'attrs' => $attrs, 'content' => $content];
$stress = ['type' => 'doc', 'content' => [
    $p([$t('Centrado', [['type' => 'bold'], ['type' => 'italic'], ['type' => 'underline']]), $t(' rojo', [['type' => 'textStyle', 'attrs' => ['color' => '#FF0000', 'fontFamily' => 'Georgia']]]), ['type' => 'hardBreak'], $t("uno\ndos <&> \"q\" 'a' \u{0B} tab\tfin\r")], ['textAlign' => 'center']),
    $p([$t('Justificado')], ['textAlign' => 'justify']),
    $p([$t('Derecha')], ['textAlign' => 'right']),
    ['type' => 'heading', 'attrs' => ['level' => 2], 'content' => [$t('Se pierde')]],
    $p([]),
    ['type' => 'bulletList', 'content' => [$li($p([$t('uno')]), ['type' => 'bulletList', 'content' => [$li($p([$t('dos')]), ['type' => 'bulletList', 'content' => [$li($p([$t('tres')]), ['type' => 'bulletList', 'content' => [$li($p([$t('cuatro')]))]])]])]])]],
    ['type' => 'orderedList', 'content' => [$li($p([$t('a')])), $li($p([$t('b')]), ['type' => 'orderedList', 'content' => [$li($p([$t('b.1')]))]])]],
    ['type' => 'table', 'content' => [
        ['type' => 'tableRow', 'content' => [
            $cell('tableHeader', ['colspan' => 2, 'colwidth' => [100, 220]], [$p([$t('H1')])]),
            $cell('tableHeader', ['backgroundColor' => '#00FF00', 'colwidth' => [80]], [$p([$t('H2', [['type' => 'textStyle', 'attrs' => ['color' => '#111111']]])])]),
        ]],
        ['type' => 'tableRow', 'content' => [
            $cell('tableHeader', ['rowspan' => 2], [$p([$t('R')])]),
            $cell('tableCell', ['borderStyle' => 'thick', 'textColor' => '#123456', 'bold' => true], [$p([$t('x', [['type' => 'italic']])])]),
            $cell('tableCell', ['borderStyle' => 'none', 'italic' => false, 'textAlign' => 'center'], [$p([$t('y', [['type' => 'italic'], ['type' => 'textStyle', 'attrs' => ['fontFamily' => 'Courier New']]])])]),
        ]],
        ['type' => 'tableRow', 'content' => [
            $cell('tableCell', ['borderStyle' => 'thin', 'backgroundColor' => '#ABCDEF'], [$p([$t('z')])]),
            $cell('tableCell', [], []),
        ]],
        ['type' => 'tableRow', 'content' => [
            $cell('tableCell', [], [['type' => 'table', 'content' => [['type' => 'tableRow', 'content' => [$cell('tableCell', [], [$p([$t('n1')])]), $cell('tableCell', [], [['type' => 'bulletList', 'content' => [$li($p([$t('n2')]))]]])]]]]]),
            $cell('tableCell', ['colspan' => 2], [$p([$t('w')], ['textAlign' => 'left'])]),
        ]],
    ]],
    ['type' => 'table', 'content' => [
        ['type' => 'tableRow', 'content' => [$cell('tableHeader', ['rowspan' => 3], [$p([$t('Lateral')])]), $cell('tableHeader', [], [$p([$t('A')])])]],
        ['type' => 'tableRow', 'content' => [$cell('tableCell', [], [$p([$t('B')])])]],
        ['type' => 'tableRow', 'content' => [$cell('tableCell', [], [$p([$t('C')])])]],
    ]],
]];
$empty = ['type' => 'doc', 'content' => [['type' => 'paragraph']]];
$extra = [
    ['key' => 'x1', 'title' => 'Prueba de estructura', 'orientation' => 'portrait', 'fields' => [
        ['definition_id' => 'd1', 'key' => 'estructura', 'label' => 'Campo de estructura', 'quien_llena' => 'docente', 'document' => $stress],
        ['definition_id' => 'd2', 'key' => 'mismo', 'label' => '  PRUEBA de estructura ', 'quien_llena' => 'docente', 'document' => $stress],
        ['definition_id' => 'd3', 'key' => 'vacio', 'label' => 'Vacío', 'quien_llena' => 'docente', 'document' => $empty],
    ]],
    ['key' => 'x2', 'title' => 'Compacta', 'blocks' => [['compact' => true, 'page_orientation' => 'landscape']], 'fields' => [
        ['definition_id' => 'd4', 'key' => 'compacto', 'label' => 'Compacto', 'quien_llena' => 'docente', 'document' => $stress],
    ]],
    ['key' => 'x3', 'title' => 'Tipos antiguos', 'orientation' => 'portrait', 'fields' => [
        ['definition_id' => 'd5', 'key' => 'ficha', 'type' => 'automatico', 'config' => ['source' => 'identification_card'], 'label' => 'Ficha', 'document' => $stress],
        ['definition_id' => 'd6', 'key' => 'formacion_experiencia', 'type' => 'texto', 'label' => 'Oculto', 'document' => $stress],
        ['definition_id' => 'd7', 'key' => 'libre', 'type' => 'texto', 'label' => 'Caja', 'document' => $stress],
        ['definition_id' => 'd8', 'key' => 'vacia', 'type' => 'ficha', 'label' => 'Caja vacía', 'document' => $empty],
    ]],
    ['key' => 'x4', 'title' => 'Sin campos', 'orientation' => 'portrait', 'fields' => []],
];
$context = ['career' => ['name' => 'Software', 'faculty' => 'Ciencias Administrativas', 'faculty_id' => 'f0000000-0000-4000-8000-000000000001'], 'subject' => ['name' => 'Biología', 'code' => 'C2']];
$identification = ['faculty' => 'Ciencias Administrativas', 'career' => 'Software', 'subject' => 'Biología', 'code' => 'C2', 'teacher' => 'Ana Pérez'];
$stamp = fn (string $role, string $name) => SignatureAnchor::stamp($role, $name, '24-11-2026 10:15', '4B2D19A0', 'AUTORIDAD DE CERTIFICACION');
$variables = app(TemplateContext::class)->using(TemplateDefinition::trusted($definition), fn (): array => [
    ...TemplateVariables::resolve(['identification' => $identification, 'academic_context' => $context]),
    ...array_filter(TemplateVariables::approval(['submitted_on' => '20-11-2026', 'librarian' => 'Lucía Biblioteca', 'verified_on' => '22-11-2026', 'coordinator' => 'Carlos Coordinador', 'approved_on' => '24-11-2026']), fn (string $value): bool => $value !== ''),
    ...TemplateVariables::signatures(['docente' => $stamp('docente', 'ANA PEREZ'), 'biblioteca' => $stamp('biblioteca', 'LUCIA BIBLIOTECA'), 'coordinacion' => $stamp('coordinacion', 'CARLOS COORDINADOR')]),
]);
$cases = [
    'plantilla' => [[], $sections, ['institution' => $logos['png_wide'], 'faculty' => $logos['png_square']]],
    'estilos' => [
        ['paper' => 'a4', 'font_family' => 'Times New Roman', 'margin_cm' => 2.5, 'line_height' => 1.5, 'paragraph_spacing_pt' => 12, 'body' => ['alignment' => 'justify'], 'title' => ['alignment' => 'left', 'italic' => true], 'section_title' => ['alignment' => 'center', 'italic' => true], 'colors' => ['table_header_background' => null, 'empty_text' => '#B91C1C'], 'empty_text' => 'Sin información'],
        [...array_slice($sections, 0, 3), ...$extra],
        ['institution' => $logos['gif'], 'faculty' => $logos['jpeg']],
    ],
    'horizontal' => [
        ['paper' => 'legal', 'orientation' => 'landscape', 'font_family' => 'Verdana', 'sizes' => ['title' => 18, 'section' => 13, 'body' => 9], 'colors' => ['text' => '#1F2937', 'title' => '#7C2D12', 'table_header_background' => '#DBEAFE', 'table_header_text' => '#1E3A8A', 'table_border' => '#9CA3AF']],
        [...array_slice($sections, 3, 4), $extra[0]],
        ['institution' => $logos['png_wide'], 'faculty' => $logos['png_wide']],
    ],
    'un_logo' => [['header' => ['logos' => [['source' => 'faculty', 'height_pt' => 50]], 'left_share' => 0.4]], array_slice($sections, 0, 2), ['institution' => $logos['png_wide'], 'faculty' => $logos['jpeg']]],
    'sin_logos' => [['header' => ['logos' => [], 'left_share' => 0.5]], array_slice($sections, 0, 2), ['institution' => $logos['png_wide'], 'faculty' => $logos['png_square']]],
];
$renderer = app(PhpWordDocumentRenderer::class);
$docx = new ReflectionMethod($renderer, 'docx');
$out = ['definition' => $definition, 'template_variables' => $variables, 'cases' => []];
foreach ($cases as $name => [$document, $caseSections, $caseLogos]) {
    $snapshot = [
        'template_definition' => [...$definition, 'document' => array_replace_recursive($definition['document'], $document)],
        'academic_context' => $context,
        'logos' => $caseLogos,
        'template_variables' => $variables,
        'sections' => $caseSections,
    ];
    if (array_key_exists('header', $document)) {
        $snapshot['template_definition']['document']['header'] = $document['header'];
    }
    $input = new DocumentRenderInput('Biología', 'C2', '2026-2', 2, str_repeat('ab', 32), '2026-11-24T15:30:00+00:00', 'es-EC', $snapshot);
    $bytes = $docx->invoke($renderer, $input);
    $path = tempnam(sys_get_temp_dir(), 'word-golden-');
    file_put_contents($path, $bytes);
    $zip = new ZipArchive;
    $zip->open($path);
    $parts = [];
    for ($index = 0; $index < $zip->numFiles; $index++) {
        $entry = $zip->getNameIndex($index);
        $parts[$entry] = hash('sha256', (string) $zip->getFromIndex($index));
    }
    $zip->close();
    unlink($path);
    ksort($parts);
    unset($snapshot['template_definition'], $snapshot['template_variables']);
    $out['cases'][] = ['name' => $name, 'document' => $document, 'snapshot' => $snapshot, 'parts' => $parts];
}
echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
