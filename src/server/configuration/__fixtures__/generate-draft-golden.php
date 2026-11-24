<?php

$backend = $argv[1] ?? '';
require $backend.'/vendor/autoload.php';
$app = require $backend.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$app->make(Illuminate\Contracts\Http\Kernel::class);

use App\Modules\Configuration\Application\OfficialTemplate;
use App\Modules\Configuration\Domain\Blocks\BlockDefinition;
use App\Modules\Configuration\Domain\Blocks\RepeatableTable;
use App\Modules\Configuration\Application\TemplateContext;
use App\Modules\Configuration\Application\TemplateDraftProblems;
use App\Modules\Configuration\Application\TemplateDraftRehearsal;
use App\Modules\Configuration\Presentation\Http\Requests\ImportTemplateStructureRequest;
use Illuminate\Contracts\Debug\ExceptionHandler;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Http\Middleware\ConvertEmptyStringsToNull;
use Illuminate\Foundation\Http\Middleware\TrimStrings;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

config(['database.default' => 'golden', 'database.connections.golden' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '', 'foreign_key_constraints' => false]]);
DB::purge('golden');
Schema::create('plantilla_silabo', function (Blueprint $table): void {
    $table->string('plantilla_id')->primary();
    $table->string('plantilla_modificada_en')->nullable();
    $table->text('definicion_plantilla');
});
Schema::create('secciones_plantilla', function (Blueprint $table): void {
    $table->string('seccion_plantilla_id')->primary();
    $table->string('plantilla_id');
    $table->string('clave_seccion_plantilla');
    $table->string('titulo_seccion_plantilla');
    $table->integer('posicion_seccion_plantilla');
    $table->boolean('vigente_en_plantilla')->default(true);
    $table->string('orientacion_seccion_plantilla')->default('portrait');
});
Schema::create('campos_plantilla', function (Blueprint $table): void {
    $table->string('campo_plantilla_id')->primary();
    $table->string('seccion_plantilla_id');
    $table->string('plantilla_id');
    $table->string('clave_campo_plantilla');
    $table->string('titulo_campo_plantilla')->default('');
    $table->integer('posicion_campo_plantilla');
    $table->boolean('vigente_en_plantilla')->default(true);
});
Schema::create('definiciones_campo', function (Blueprint $table): void {
    $table->string('definicion_campo_id')->primary();
    $table->string('campo_plantilla_id');
    $table->string('plantilla_id');
    $table->boolean('vigente_en_plantilla')->default(true);
    $table->string('quien_llena_definicion_campo')->default('carrera');
    $table->text('contenido_definicion_campo');
});
Schema::create('valores_campo', function (Blueprint $table): void {
    $table->string('valor_campo_id')->primary();
    $table->string('silabo_id')->nullable();
    $table->string('definicion_campo_id');
    $table->text('valor_campo')->nullable();
    $table->string('asignatura_id')->nullable();
});
Schema::create('convocatorias_universidad', function (Blueprint $table): void {
    $table->string('convocatoria_universidad_id')->primary();
    $table->string('estado_convocatoria_universidad');
});

$definition = OfficialTemplate::definition();
DB::table('plantilla_silabo')->insert(['plantilla_id' => '01a1c5ba-10b4-7129-925f-c28a9489323c', 'definicion_plantilla' => json_encode($definition->toArray())]);
$template = App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate::query()->firstOrFail();

$official = array_map(fn (array $section): array => [
    'key' => $section['key'],
    'title' => $section['title'],
    'orientation' => $section['orientation'] ?? 'portrait',
    'fields' => array_map(fn (array $field): array => [
        'key' => $field['key'],
        'label' => $field['label'] ?? '',
        'quien_llena' => $field['quien_llena'],
        'content' => $field['content'],
    ], $section['fields'] ?? []),
], OfficialTemplate::sections());
$few = array_slice($official, 0, 2);
$layout = ['margin_cm' => 2.5, 'title_font_size' => 16, 'section_font_size' => 12, 'body_font_size' => 11];
$draft = fn (array $sections, array $extra = []): array => ['version' => 1, 'title' => '  Sílabo de prueba  ', 'layout' => $layout, 'sections' => $sections, ...$extra];
$paragraph = fn (array $inline): array => ['type' => 'paragraph', 'content' => $inline];
$text = fn (string $value): array => ['type' => 'text', 'text' => $value];
$doc = fn (array ...$nodes): array => ['type' => 'doc', 'content' => $nodes];
$choice = fn (string $id, array $options, array $extra = []): array => ['type' => 'response', 'attrs' => ['kind' => 'una', 'options' => array_map(fn (string $key): array => ['const' => $key, 'title' => ucfirst($key)], $options), 'id' => $id, ...$extra]];
$field = fn (string $key, string $who, array $content, array $extra = []): array => ['key' => $key, 'label' => ucfirst(str_replace('_', ' ', $key)), 'quien_llena' => $who, 'content' => $content, ...$extra];
$extraSection = fn (array $fields, string $key = 'extra'): array => ['key' => $key, 'title' => 'Sección extra', 'orientation' => 'landscape', 'fields' => $fields];

$cases = [
    'official' => $draft($official),
    'conditions' => $draft([...$few, $extraSection([
        $field('pregunta', 'carrera', $doc($paragraph([$text('¿Aplica? '), $choice('aplica', ['si', 'no'])]))),
        $field('detalle', 'docente', $doc($paragraph([$text('Detalle')]), ['type' => 'paragraph']), ['show_if' => ['response' => 'aplica', 'options' => ['si', 'si']], 'max_length' => 1200]),
        $field('nota', 'carrera', $doc($paragraph([$choice('interna', ['a', 'b'], ['showIf' => ['response' => 'aplica', 'options' => ['no']]])]))),
    ])]),
    'missing_and_empty' => $draft([...array_slice($official, 1, 9), ['key' => 'vacia', 'title' => 'Vacía', 'fields' => []], ['key' => 'sin_campos', 'title' => 'Sin campos']]),
    'invalid_rules' => $draft([
        ['key' => 'Mala Clave', 'title' => str_repeat('t', 181), 'orientation' => 'diagonal', 'fields' => [
            ['key' => 'repetida', 'label' => ['x'], 'quien_llena' => 'nadie', 'content' => 5],
            ['key' => 'repetida', 'quien_llena' => 'carrera', 'content' => ['type' => 'paragraph']],
            ['quien_llena' => 'institucional', 'content' => $doc($paragraph([$text('Hola')])), 'max_length' => 20],
            ['key' => 'limite', 'quien_llena' => 'carrera', 'content' => $doc($paragraph([$text('Hola')])), 'max_length' => 0],
            'texto',
        ]],
        ['key' => 'Mala Clave', 'fields' => 'ninguno'],
        ['title' => 'Sin clave', 'fields' => [['key' => 'otro', 'quien_llena' => 'docente', 'content' => ['type' => 'doc', 'content' => [['type' => 'heading']]]]]],
        'suelta',
    ], ['response_policy' => 'abierta', 'lists' => 'x', 'document' => 'x']),
    'invalid_layout' => ['version' => 3, 'title' => ['no'], 'layout' => ['margin_cm' => 7, 'title_font_size' => 'grande', 'body_font_size' => null], 'sections' => $official],
    'condition_problems' => $draft([...$few, $extraSection([
        $field('uno', 'carrera', $doc($paragraph([$choice('repetida', ['si', 'no']), $choice('repetida', ['x'])]))),
        $field('dos', 'carrera', $doc($paragraph([$text('Dos')])), ['show_if' => ['response' => 'nadie', 'options' => ['si']]]),
        $field('tres', 'carrera', $doc($paragraph([$text('Tres')])), ['show_if' => ['response' => 'repetida', 'options' => ['quizas']]]),
        $field('cuatro', 'carrera', $doc($paragraph([$text('Cuatro')])), ['show_if' => ['response' => 'texto_libre', 'options' => ['si']]]),
        $field('cinco', 'carrera', $doc($paragraph([['type' => 'response', 'attrs' => ['kind' => 'texto', 'id' => 'texto_libre']]]))),
        $field('seis', 'carrera', $doc($paragraph([$text('Seis')])), ['show_if' => ['response' => 'texto_libre', 'options' => ['si']]]),
        $field('siete', 'carrera', $doc($paragraph([$text('Siete')])), ['show_if' => 'mal']),
    ])]),
    'institutional_response' => $draft([...$few, $extraSection([
        $field('fija', 'institucional', $doc($paragraph([$text('Fija '), $choice('fija', ['si'])]))),
    ])]),
    'no_sections' => ['version' => 1],
    'legacy_responsible' => $draft([...$few, $extraSection([
        $field('legado', 'coordinacion', $doc($paragraph([$text('Legado')])), ['max_length' => 300]),
    ])]),
];

$practices = BlockDefinition::define('practicas', RepeatableTable::build(RepeatableTable::withKeys([
    'kind' => 'practicas', 'label' => 'Prácticas de laboratorio', 'list' => 'practicas', 'item' => 'práctica', 'min' => 1, 'max' => 10, 'initial' => 2, 'band' => null,
    'columns' => [
        ['title' => 'Tema', 'type' => 'text', 'max_length' => 200, 'multiline' => false, 'width' => 200, 'required' => true],
        ['title' => 'Modalidad', 'type' => 'choice', 'options' => [['label' => 'Presencial'], ['label' => 'Virtual']], 'width' => null, 'required' => false],
    ],
])), array_keys($definition->variables()));
$block = fn (string $kind): array => ['type' => 'doc', 'content' => [['type' => 'documentBlock', 'attrs' => ['kind' => $kind, 'props' => [], 'value' => []]]]];
$file = json_decode(file_get_contents(base_path(OfficialTemplate::PATH)), true);
$file['version'] = 2;
$cases += [
    'html_content' => $draft([...$few, $extraSection([
        $field('html', 'carrera', []),
        $field('lineas', 'carrera', []),
        $field('fija_html', 'institucional', []),
        $field('numeros', 'carrera', []),
        $field('variable_mala', 'carrera', []),
        $field('vacia', 'carrera', []),
    ])]),
    'block_changes' => $draft([...$few, $extraSection([$field('practicas_lab', 'carrera', $block('practicas'))])], ['block_changes' => ['practicas' => $practices]]),
    'block_changes_locked' => $draft($few, ['block_changes' => ['identificacion' => [...$definition->block('identificacion'), 'label' => 'Otra identificación']]]),
    'block_changes_broken' => $draft($few, ['block_changes' => ['practicas' => [...$practices, 'rules' => [['code' => 'x', 'on' => 'submit', 'message' => 'm', 'checks' => [['filled' => 'practicas.*.nada', 'equals' => ['count' => 'practicas']]]]]]]]),
    'block_changes_list' => $draft($few, ['block_changes' => [$practices]]),
    'block_changes_version_2' => [...$file, 'block_changes' => ['identificacion' => [...$definition->block('identificacion'), 'label' => 'Otra identificación']]],
    'lists' => $draft($official, ['lists' => [['block' => 'unidades', 'path' => 'units', 'min' => 1, 'max' => 6, 'initial' => 3], ['block' => 'unidades', 'path' => 'units.*.semanas', 'min' => 0, 'max' => 20, 'initial' => 2], 'suelta']]),
    'lists_ok' => $draft([...$few, $extraSection([$field('unidades_lab', 'carrera', $block('unidades'))])], ['title' => '  Otro título  ', 'lists' => [['block' => 'unidades', 'path' => 'units', 'min' => 1, 'max' => 6, 'initial' => 3], ['block' => 'unidades', 'path' => 'units.*.semanas', 'min' => 0, 'max' => 20, 'initial' => 2]]]),
    'lists_unknown_block' => $draft($few, ['lists' => [['block' => 'nada', 'path' => 'x', 'min' => 0, 'max' => 1, 'initial' => 0]]]),
    'lists_bad_limits' => $draft($few, ['lists' => [['block' => 'unidades', 'path' => 'units', 'min' => 5, 'max' => 3, 'initial' => 3]]]),
    'lists_bad_start' => $draft($few, ['lists' => [['block' => 'bibliografia', 'path' => 'libros', 'min' => 1, 'max' => 3, 'initial' => 9]]]),
    'lists_bad_path' => $draft($few, ['lists' => [['block' => 'bibliografia', 'path' => 'libros.*.autor', 'min' => 0, 'max' => 3, 'initial' => 1]]]),
    'version_2' => $file,
    'version_2_bad_variable' => [...$file, 'variables' => ['Mala' => ['label' => 'x', 'source' => 'nada']]],
    'version_2_unknown_source' => [...$file, 'variables' => [...$file['variables'], 'extra' => ['label' => 'Extra', 'source' => 'nada']]],
    'version_2_missing_required' => [...$file, 'sections' => array_slice($file['sections'], 0, 3)],
    'version_2_bad_block' => [...$file, 'blocks' => [...$file['blocks'], 'nueva' => ['label' => 'Nueva', 'layout' => '<p data-band="#aabbcc">x</p>']]],
    'version_2_bad_preset' => [...$file, 'presets' => [['key' => 'p', 'label' => 'P', 'field' => 'nada']]],
    'version_2_policy' => [...$file, 'response_policy' => 'abierta'],
];
$cases['html_content']['sections'][2]['fields'][0]['content'] = '<p>Hola <strong>mundo</strong> &amp; más</p><ul><li>uno</li><li>dos</li></ul><table><tr><th>A</th><td style="text-align:center">B</td></tr></table>';
$cases['html_content']['sections'][2]['fields'][1]['content'] = ['<p>línea uno</p>', '<p style="text-align:center">línea dos</p>', '<ol><li>tres</li></ol>'];
$cases['html_content']['sections'][2]['fields'][2]['content'] = '<p>Fija <span data-response=\'{"kind":"una","options":[{"const":"si","title":"Sí"}],"id":"fija_html"}\'></span></p>';
$cases['html_content']['sections'][2]['fields'][3]['content'] = [1, 2];
$cases['html_content']['sections'][2]['fields'][4]['content'] = '<p><span data-variable="nada"></span></p>';
$cases['html_content']['sections'][2]['fields'][5]['content'] = '   ';
$cases['html_ok'] = $cases['html_content'];
$cases['html_ok']['sections'][2]['fields'] = array_slice($cases['html_content']['sections'][2]['fields'], 0, 2);

$middleware = function (array $payload): array {
    $request = Request::create('/api/v1/admin/template/x/draft/check', 'POST', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'], json_encode($payload));
    $request = app(TrimStrings::class)->handle($request, fn (Request $request): Request => $request);
    $request = app(ConvertEmptyStringsToNull::class)->handle($request, fn (Request $request): Request => $request);

    return $request->all();
};

$render = function (Throwable $exception): array {
    $request = Request::create('/api/v1/admin/template/x/draft/preview', 'POST', server: ['HTTP_ACCEPT' => 'application/json']);
    $response = app(ExceptionHandler::class)->render($request, $exception);

    return ['status' => $response->getStatusCode(), 'body' => $response->getContent()];
};

$jsonbOrder = function (mixed $value) use (&$jsonbOrder): mixed {
    if (! is_array($value)) {
        return $value;
    }
    if (array_is_list($value)) {
        return array_map($jsonbOrder, $value);
    }
    uksort($value, fn (string $left, string $right): int => strlen($left) <=> strlen($right) ?: strcmp($left, $right));

    return array_map($jsonbOrder, $value);
};

$output = [];
foreach ($cases as $name => $raw) {
    $payload = $middleware($raw);
    app()->forgetInstance(TemplateContext::class);
    $problems = app(TemplateDraftProblems::class)->of($payload);
    $request = new class extends ImportTemplateStructureRequest
    {
        public function authorize(): bool
        {
            return true;
        }
    };
    $request = $request::createFrom(Request::create('/', 'POST', $payload), $request);
    $request->setContainer(app())->setRedirector(app('redirect'));
    $preview = null;
    $impact = null;
    try {
        $request->validateResolved();
        $sections = $request->validated('sections');
        try {
            $result = app(TemplateDraftRehearsal::class)->preview($template, $sections, $request->definition());
            foreach ($result['sheets'] as $index => $sheet) {
                foreach ($sheet['fields'] as $position => $sheetField) {
                    $result['sheets'][$index]['fields'][$position]['content'] = $jsonbOrder($sheetField['content']);
                }
            }
            $ids = [];
            foreach ($result['sheets'] as $index => $sheet) {
                $ids[$sheet['id']] = "section-{$index}";
                foreach ($sheet['fields'] as $position => $sheetField) {
                    $ids[$sheetField['id']] = "field-{$index}-{$position}";
                }
            }
            $preview = ['status' => 200, 'body' => strtr(json_encode($result), $ids)];
        } catch (ValidationException $exception) {
            $preview = $render($exception);
        }
        $impact = ['status' => 200, 'body' => json_encode(app(TemplateDraftRehearsal::class)->impact($template, $sections, $request->definition()))];
    } catch (ValidationException $exception) {
        $preview = $render($exception);
        $impact = $preview;
    }
    $output[$name] = ['payload' => $raw, 'problems' => json_encode(['problems' => $problems]), 'preview' => $preview, 'impact' => $impact];
}

file_put_contents(__DIR__.'/draft-golden.json', json_encode($output, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)."\n");
