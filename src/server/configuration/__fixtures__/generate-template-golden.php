<?php

$backend = $argv[1] ?? '';
require $backend.'/vendor/autoload.php';
$app = require $backend.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Modules\Academic\Application\SubjectProfileFields;
use App\Modules\Configuration\Application\OfficialTemplate;
use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Configuration\Application\TemplateContext;
use App\Modules\Configuration\Application\TemplatePresentation;
use App\Modules\Configuration\Application\TemplateVariables;
use App\Modules\Configuration\Domain\DocumentHtml;
use App\Modules\Configuration\Domain\FieldDocument;
use App\Modules\Configuration\Domain\FieldResponse;
use App\Modules\Configuration\Domain\FreeText;
use App\Modules\Configuration\Domain\ResponseKind;
use App\Modules\Syllabus\Application\IdentificationCard;
use Illuminate\Validation\ValidationException;

$definition = OfficialTemplate::definition();
$sections = OfficialTemplate::sections();
$paragraph = fn (array $inline): array => ['type' => 'paragraph', 'content' => $inline];
$cell = fn (string $type, array $content): array => ['type' => $type, 'attrs' => ['colspan' => 1, 'rowspan' => 1], 'content' => $content];
$sections[] = ['key' => 'sinteticos', 'title' => 'Sintéticos', 'fields' => [
    ['key' => 'respuestas', 'quien_llena' => 'carrera', 'content' => ['type' => 'doc', 'content' => [
        $paragraph([['type' => 'text', 'text' => 'Pregunta: '], ['type' => 'response', 'attrs' => ['kind' => 'una', 'options' => [['const' => 'si', 'title' => ' Sí '], ['const' => 'no', 'title' => 'No']], 'id' => 'tiene', 'display' => 'desplegable']]]),
        $paragraph([['type' => 'response', 'attrs' => ['kind' => 'varias', 'options' => [['const' => 'a', 'title' => 'A'], ['const' => 'b', 'title' => 'B'], ['const' => 'c', 'title' => 'C']], 'minChoices' => 1, 'maxChoices' => 2, 'showIf' => ['response' => 'tiene', 'options' => ['si', 'si']]]]]),
        $paragraph([['type' => 'response', 'attrs' => ['kind' => 'texto', 'maxLength' => 200, 'help' => '  Ayuda   corta ', 'required' => false], 'marks' => [['type' => 'bold']]]]),
        $paragraph([['type' => 'response', 'attrs' => ['kind' => 'una', 'options' => []]]]),
        ['type' => 'table', 'content' => [
            ['type' => 'tableRow', 'content' => [$cell('tableHeader', [$paragraph([['type' => 'text', 'text' => 'Columna']])]), $cell('tableHeader', [$paragraph([['type' => 'text', 'text' => 'Elección']])])]],
            ['type' => 'tableRow', 'content' => [$cell('tableCell', [['type' => 'paragraph']]), $cell('tableCell', [$paragraph([['type' => 'response', 'attrs' => ['kind' => 'una', 'options' => [['const' => 'x', 'title' => 'Equis']]]]])])]],
        ]],
        ['type' => 'bulletList', 'content' => [['type' => 'listItem', 'content' => [['type' => 'paragraph'], ['type' => 'paragraph']]]]],
    ]]],
    ['key' => 'variables', 'quien_llena' => 'institucional', 'content' => ['type' => 'doc', 'content' => [
        ['type' => 'paragraph', 'attrs' => ['textAlign' => 'center'], 'content' => [
            ['type' => 'text', 'text' => 'Docente: ', 'marks' => [['type' => 'textStyle', 'attrs' => ['color' => '#112233', 'fontSize' => '12pt', 'fontFamily' => 'Arial']], ['type' => 'underline']]],
            ['type' => 'variable', 'attrs' => ['id' => 'nombre_docente'], 'marks' => [['type' => 'italic']]],
            ['type' => 'hardBreak'],
            ['type' => 'variable', 'attrs' => ['id' => 'prerrequisitos_asignatura', 'listStyle' => 'number']],
            ['type' => 'text', 'text' => ' fin'],
        ]],
        ['type' => 'orderedList', 'content' => [['type' => 'listItem', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'variable', 'attrs' => ['id' => 'firma_docente', 'listStyle' => 'bullet']]]]]]]],
    ]]],
    ['key' => 'sin_espacios', 'quien_llena' => 'docente', 'content' => ['type' => 'doc', 'content' => [$paragraph([['type' => 'text', 'text' => 'Solo texto']])]]],
]];

$answer = function (array $node) use (&$answer): array {
    if (($node['type'] ?? null) === ResponseKind::NODE) {
        $attrs = $node['attrs'] ?? [];
        $options = $attrs['options'] ?? [];
        $node['attrs']['value'] = match ($attrs['kind'] ?? null) {
            'texto' => "Respuesta\nde prueba",
            'una' => $options[0]['const'] ?? null,
            'varias' => array_map(fn (array $option): string => $option['const'], array_slice($options, 0, 1)),
            default => null,
        };
        if (($attrs['kind'] ?? null) !== 'texto' && $options === []) {
            $node['attrs']['options'] = [['const' => 'propia', 'title' => 'Opción propia']];
            $node['attrs']['value'] = ($attrs['kind'] ?? null) === 'varias' ? ['propia'] : 'propia';
        }
    }
    if (($node['type'] ?? null) === 'paragraph' && FieldResponse::blank($node)) {
        return [...$node, 'content' => [['type' => 'text', 'text' => 'Escrito por carrera', 'marks' => [['type' => 'bold']]]]];
    }
    if (isset($node['content']) && is_array($node['content'])) {
        $node['content'] = array_map($answer, $node['content']);
    }
    if (($node['type'] ?? null) === 'table' && FieldResponse::listTable($node)) {
        $node['content'][] = end($node['content']);
    }

    return $node;
};

$attempt = function (callable $work): array {
    try {
        return ['ok' => $work()];
    } catch (ValidationException $exception) {
        return ['errors' => $exception->errors()];
    }
};

$output = app(TemplateContext::class)->using($definition, function () use ($definition, $sections, $answer, $attempt): array {
    $variables = TemplateVariables::resolve(['identification' => IdentificationCard::sample()]);
    $fields = [];
    foreach ($sections as $section) {
        foreach ($section['fields'] ?? [] as $field) {
            $normalized = FieldDocument::normalize($field['content']);
            $template = FieldResponse::template($normalized);
            $stored = $answer($template);
            $fields[] = [
                'key' => $field['key'],
                'label' => $field['label'] ?? '',
                'section' => $section['key'],
                'section_title' => $section['title'],
                'quien_llena' => $field['quien_llena'],
                'content_json' => json_encode($field['content'], JSON_THROW_ON_ERROR),
                'lines' => json_encode(DocumentHtml::toLines($field['content']), JSON_THROW_ON_ERROR),
                'content' => $field['content'],
                'stored' => $stored,
                'expected' => array_map(fn (mixed $value): string => json_encode($value, JSON_THROW_ON_ERROR), [
                    'normalized' => $normalized,
                    'template' => $template,
                    'writable' => FieldResponse::writable($field['content']),
                    'open' => FieldResponse::open($template),
                    'pending' => ResponseKind::pending($normalized),
                    'plain' => FreeText::plainText($normalized),
                    'resolved' => FieldDocument::resolve($normalized, $variables),
                    'template_for' => FieldResponse::templateFor($field['content'], $stored),
                    'follow' => $attempt(fn () => FieldResponse::followTemplate($field['content'], $stored)),
                    'template_of' => $attempt(fn () => SubjectProfileFields::templateOf(new FieldDefinition(['quien_llena' => $field['quien_llena'], 'contenido' => $field['content']]), $stored)),
                    'template_of_blank' => $attempt(fn () => SubjectProfileFields::templateOf(new FieldDefinition(['quien_llena' => $field['quien_llena'], 'contenido' => $field['content']]), null)),
                    'without_own_options' => ResponseKind::withoutOwnOptions(FieldResponse::templateFor($field['content'], $stored)),
                ]),
            ];
        }
    }

    return [
        'definition' => $definition->toArray(),
        'presentation' => json_encode(TemplatePresentation::definition($definition), JSON_THROW_ON_ERROR),
        'catalog' => json_encode(TemplateVariables::catalog(), JSON_THROW_ON_ERROR),
        'variables' => $variables,
        'sample' => IdentificationCard::sample(),
        'block_lines' => array_map(fn (array $block): string => json_encode(DocumentHtml::toLines(['type' => 'doc', 'content' => $block['layout']]), JSON_THROW_ON_ERROR), $definition->blocks()),
        'fields' => $fields,
    ];
});

file_put_contents(__DIR__.'/template-golden.json', json_encode($output, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)."\n");
