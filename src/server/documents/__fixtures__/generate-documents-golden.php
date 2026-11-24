<?php
$backend = $argv[1] ?? '';
require $backend.'/vendor/autoload.php';
$app = require $backend.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use App\Support\CanonicalHasher;
use App\Modules\Syllabus\Application\SyllabusConditions;
$h = new CanonicalHasher;
$values = [
  ['z' => 1, 'a' => ['b' => 2, 'A' => 3, 'á' => 4, '10' => 5, '9' => 6], 'list' => [3, 1, 2], 'empty' => [], 'nested' => [['y' => true, 'x' => null]]],
  ['text' => "línea\ncon \"comillas\" \\ barra / y \t tab \u{1} ctrl \u{7f} \u{2028}\u{2029} ñ € 😀"],
  ['floats' => [1.5, 0.1, 2.25, -0.75, 1.0E-5, 0.0001, 123456.789]],
  ['holes' => [0 => 'a', 2 => 'b'], 'ints' => [5 => 'x', 1 => 'y'], 'mixed' => ['k' => 'v', 0 => 'z']],
  [1, 'two', false, null, 3],
  'string',
  42,
];
$canonical = array_map(fn ($value) => ['value' => $value, 'json' => $h->json($value), 'hash' => $h->hash($value)], $values);
$response = fn (string $id, string $value, ?array $showIf = null) => ['type' => 'response', 'attrs' => array_filter(['id' => $id, 'kind' => 'una', 'value' => $value, 'required' => true, 'options' => [['const' => 'si', 'title' => 'Sí'], ['const' => 'no', 'title' => 'No']], 'showIf' => $showIf], fn ($v) => $v !== null)];
$hiddenIf = ['response' => 'r1', 'options' => ['no']];
$shownIf = ['response' => 'r1', 'options' => ['si']];
$doc = fn (array ...$content) => ['type' => 'doc', 'content' => $content];
$p = fn (array ...$content) => ['type' => 'paragraph', 'content' => $content];
$text = fn (string $t) => ['type' => 'text', 'text' => $t];
$sections = [
  ['key' => 'a', 'title' => 'A', 'orientation' => 'portrait', 'fields' => [
    ['definition_id' => 'f1', 'key' => 'pregunta', 'label' => 'Pregunta', 'quien_llena' => 'docente', 'document' => $doc($p($response('r1', 'si')))],
    ['definition_id' => 'f2', 'key' => 'detalle', 'label' => 'Detalle', 'quien_llena' => 'docente', 'document' => $doc($p($text('oculto')))],
    ['definition_id' => 'f3', 'key' => 'mixto', 'label' => 'Mixto', 'quien_llena' => 'docente', 'document' => $doc(
      $p($text('visible')),
      $p($response('r2', 'no', $hiddenIf)),
      $p($response('r3', 'si', $shownIf)),
      ['type' => 'table', 'content' => [['type' => 'tableRow', 'content' => [
        ['type' => 'tableCell', 'attrs' => ['colspan' => 1], 'content' => [$p($response('r4', 'si', $hiddenIf))]],
        ['type' => 'tableCell', 'content' => [$p($text('celda'))]],
      ]]]],
      ['type' => 'bulletList', 'content' => [['type' => 'listItem', 'content' => [$p($response('r5', 'si', $hiddenIf))]]]],
      ['type' => 'orderedList', 'content' => [['type' => 'listItem', 'content' => [$p($text('uno'))]], ['type' => 'listItem', 'content' => [$p($response('r6', 'no', $hiddenIf))]]]],
      ['type' => 'bulletList', 'content' => []],
    )],
  ]],
  ['key' => 'b', 'title' => 'B', 'orientation' => 'landscape', 'fields' => [
    ['definition_id' => 'f4', 'key' => 'solo_oculto', 'label' => 'Solo', 'quien_llena' => 'coordinacion', 'document' => $doc($p($response('r7', 'si')))],
  ]],
  ['key' => 'c', 'title' => 'C', 'orientation' => 'portrait', 'fields' => []],
  ['key' => 'd', 'title' => 'D', 'orientation' => 'portrait', 'fields' => [
    ['definition_id' => 'f5', 'key' => 'despues', 'label' => 'Después', 'quien_llena' => 'docente', 'document' => $doc($p($response('r8', 'no', ['response' => 'r7', 'options' => ['si']])))],
    ['definition_id' => 'f6', 'key' => 'sin_documento', 'label' => 'Sin', 'quien_llena' => 'docente'],
  ]],
];
$cases = [
  ['sections' => $sections, 'conditions' => ['detalle' => ['response' => 'r1', 'options' => ['no']], 'solo_oculto' => ['response' => 'r1', 'options' => ['no']]]],
  ['sections' => $sections, 'conditions' => []],
  ['sections' => [['key' => 'x', 'title' => 'X', 'orientation' => 'portrait', 'fields' => [['definition_id' => 'f9', 'key' => 'k', 'label' => 'K', 'quien_llena' => 'docente', 'document' => $doc($p($text('nada')))]]]], 'conditions' => []],
];
$visible = array_map(fn ($case) => [...$case, 'expected' => SyllabusConditions::visibleSections($case['sections'], $case['conditions'])], $cases);
echo json_encode(['canonical' => $canonical, 'visible_sections' => $visible], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_PRESERVE_ZERO_FRACTION);
