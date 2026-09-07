<?php

namespace App\Modules\Configuration\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Application\TemplateVariables;
use App\Modules\Configuration\Domain\TableLayout;
use App\Modules\Configuration\Domain\TemplateDocument;
use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateBlock;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\InProgressWork;
use App\Modules\Syllabus\Application\ProcessLocks;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class SaveTemplateDocument
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly ProcessLocks $locks,
        private readonly InProgressWork $work,
    ) {}

    public static function fingerprint(TemplateBlock $block): string
    {
        $block->loadMissing('fields');

        return hash('sha256', json_encode([$block->titulo, $block->configuracion, $block->fields->toArray()], JSON_THROW_ON_ERROR));
    }

    /** @param array<string, mixed>|null $document */
    public function execute(TemplateBlock $block, ?array $document, string $fingerprint, User $actor, Request $request): void
    {
        abort_unless($actor->can('manage-templates'), 403);
        $normalized = $document === null ? null : TemplateDocument::normalize($document, array_keys(TemplateVariables::definitions()));
        DB::transaction(function () use ($block, $normalized, $fingerprint, $actor, $request): void {
            SyllabusTemplate::query()->whereKey($block->plantilla_id)->lockForUpdate()->firstOrFail();
            $this->locks->assertTemplateEditable();
            $block->refresh()->load('fields');
            if (! hash_equals(self::fingerprint($block), $fingerprint)) {
                throw ValidationException::withMessages(['fingerprint' => 'La plantilla cambió en otra sesión. Recargue antes de guardar; su diseño no fue sobrescrito.']);
            }
            $flow = $block->configuredContentType() === 'flow';
            if ($flow !== ($normalized === null)) {
                TemplateDocument::fail($flow ? 'El estado de revisión pertenece al flujo del sistema.' : 'El diseño del bloque es obligatorio.');
            }
            $fields = $block->fields->keyBy('clave');
            $documentFieldKeys = $normalized === null
                ? []
                : array_map(
                    static fn (array $node): string => $node['attrs']['key'],
                    TemplateDocument::nodes($normalized, 'field'),
                );
            foreach ($request->input('properties', []) as $index => $property) {
                $field = $fields->get($property['key']);
                if (($field === null && ! in_array($property['key'], $documentFieldKeys, true))
                    || ($field !== null && isset($block->configuracion['detached_fields'][$field->clave]))) {
                    throw ValidationException::withMessages(["properties.$index.key" => 'El campo no pertenece al diseño actual.']);
                }
                if (($property['ai_enabled'] ?? false) && (($field?->heredado ?? false) || in_array($block->configuredContentType(), ['institutional', 'flow'], true))) {
                    throw ValidationException::withMessages(["properties.$index.ai_enabled" => 'Este campo no admite asistencia de IA.']);
                }
            }
            if ($normalized === null) {
                $this->work->requireConfirmation($request);
                $this->saveProperties($block, $request, []);
                $this->auditDesign($block, $actor, $request, $fields->count());

                return;
            }
            $normalized = $this->applyPropertyLabels($normalized, $request->input('properties', []));
            $used = [];
            $toCreate = [];
            $labels = [];
            foreach (TemplateDocument::nodes($normalized, 'field') as $node) {
                $attrs = $node['attrs'];
                $key = $attrs['key'];
                if (isset($labels[$key]) && $labels[$key] !== $attrs['label']) {
                    TemplateDocument::fail('Un campo debe conservar el mismo nombre en todas sus apariciones.');
                }
                $labels[$key] = $attrs['label'];
                $used[] = $key;
                if (isset($fields[$key])) {
                    continue;
                }
                if (! in_array($attrs['kind'], TemplateDocument::FIELD_TYPES, true)
                    || FieldDefinition::query()->where('plantilla_id', $block->plantilla_id)->where('clave', $key)->exists()) {
                    TemplateDocument::fail('El campo pertenece a otro bloque o su tipo no está permitido.');
                }
                if (isset($toCreate[$key]) && $toCreate[$key] !== $attrs) {
                    TemplateDocument::fail('Dos campos comparten nombre interno pero tienen distinta definición.');
                }
                $toCreate[$key] = $attrs;
            }
            $configuration = $block->configuracion ?? [];
            $layout = TableLayout::fromBlock($block);
            $columnKeys = [];
            $headerKeys = [];
            foreach (TemplateDocument::nodes($normalized, 'table') as $table) {
                $key = $table['attrs']['repeatKey'];
                if ($key === null) {
                    if (TemplateDocument::nodes($table, 'column') !== []) {
                        TemplateDocument::fail('Los campos de fila deben estar dentro de su tabla repetible.');
                    }

                    continue;
                }
                if (! isset($fields[$key]) || $fields[$key]->tipo !== 'repetible' || $layout === null) {
                    TemplateDocument::fail('No se reconoce el origen de las filas de la tabla.');
                }
                $used[] = $key;
                $hasRecords = false;
                $recordKeys = [];
                $totalKeys = [];
                foreach ($table['content'] as $row) {
                    $role = $row['attrs']['rowRole'];
                    $hasRecords = $hasRecords || $role === 'record';
                    foreach (TemplateDocument::nodes($row, 'column') as $node) {
                        $attrs = $node['attrs'];
                        if ($role === 'unit') {
                            $headerKeys[$attrs['key']] = ['key' => $attrs['key'], 'label' => $attrs['label']];
                        } elseif (in_array($role, ['record', 'total'], true)) {
                            if (! in_array($attrs['kind'], ['texto_largo', 'numero'], true)) {
                                TemplateDocument::fail('Las columnas admiten texto o número.');
                            }
                            if (isset($columnKeys[$attrs['key']]) && $columnKeys[$attrs['key']] !== $attrs) {
                                TemplateDocument::fail('Un campo de columna debe mantener el mismo nombre y tipo en todas sus apariciones.');
                            }
                            $columnKeys[$attrs['key']] = $attrs;
                            if ($role === 'record') {
                                $recordKeys[] = $attrs['key'];
                            } else {
                                $totalKeys[] = $attrs['key'];
                            }
                        } else {
                            TemplateDocument::fail('Un campo de columna debe estar en una fila de datos, unidad o total.');
                        }
                    }
                }
                if (! $hasRecords || $recordKeys === []) {
                    TemplateDocument::fail('La tabla repetible necesita al menos una fila con campos de datos.');
                }
                if (array_diff($totalKeys, $recordKeys) !== [] || array_intersect(array_keys($headerKeys), $recordKeys) !== []) {
                    TemplateDocument::fail('Los totales deben usar campos de datos; los campos de unidad deben tener nombres propios.');
                }
            }
            if ($layout !== null && $columnKeys !== []) {
                $known = array_column($layout['columns'], null, 'key');
                $columns = [];
                foreach ($columnKeys as $key => $attrs) {
                    $type = $attrs['kind'] === 'numero' ? 'number' : 'text';
                    if (isset($known[$key]) && $known[$key]['type'] !== $type) {
                        TemplateDocument::fail('No cambie el tipo de una columna existente; inserte un campo nuevo.');
                    }
                    $columns[] = [
                        'key' => $key, 'label' => $attrs['label'], 'type' => $type,
                        'group' => null, 'band' => null,
                        'sum' => $known[$key]['sum'] ?? false,
                        'width' => $known[$key]['width'] ?? null,
                    ];
                }
                $configuration['table'] = TableLayout::normalize([
                    ...$layout, 'columns' => $columns, 'groups' => [], 'bands' => [],
                    'header_fields' => array_values($headerKeys),
                ]);
            }
            $this->work->requireConfirmation($request);
            foreach ($labels as $key => $label) {
                $fields->get($key)?->update(['etiqueta' => $label]);
            }
            $position = $block->fields->count();
            foreach ($toCreate as $key => $attrs) {
                $block->fields()->create([
                    'plantilla_id' => $block->plantilla_id, 'clave' => $key,
                    'etiqueta' => $attrs['label'], 'tipo' => $attrs['kind'],
                    'obligatorio' => true, 'heredado' => false, 'editable_docente' => true,
                    'ia_habilitada' => false, 'posicion' => ++$position,
                ]);
            }
            // Las definiciones pueden estar referenciadas por datos y evidencia históricos.
            // Retirarlas del formulario no debe borrar esos datos ni dejar campos ocultos obligatorios.
            $detached = $configuration['detached_fields'] ?? [];
            foreach ($block->fields->where('heredado', false) as $field) {
                if (in_array($field->clave, $used, true)) {
                    if (isset($detached[$field->clave])) {
                        $field->update($detached[$field->clave]);
                        unset($detached[$field->clave]);
                    }
                } else {
                    $detached[$field->clave] ??= $field->only(['obligatorio', 'editable_docente', 'ia_habilitada']);
                    $field->update(['obligatorio' => false, 'editable_docente' => false, 'ia_habilitada' => false]);
                }
            }
            $configuration['detached_fields'] = $detached;
            $block->update([
                'titulo' => $request->has('title') ? $request->string('title')->trim()->value() : $block->titulo,
                'configuracion' => [...$configuration, 'document' => $normalized],
            ]);
            $this->saveProperties($block, $request, $detached);
            $this->auditDesign($block, $actor, $request, count(array_unique($used)));
        });
    }

    /** @param array<string, mixed> $detached */
    private function saveProperties(TemplateBlock $block, Request $request, array $detached): void
    {
        foreach ($request->input('properties', []) as $property) {
            $attributes = ['etiqueta' => $property['label'], 'ayuda' => $property['help']];
            if (array_key_exists('ai_enabled', $property) && ! in_array($block->configuredContentType(), ['institutional', 'flow'], true)) {
                // Un campo retirado conserva su configuración para una futura restauración,
                // pero no vuelve a habilitarse en el formulario actual.
                if (isset($detached[$property['key']])) {
                    $detached[$property['key']]['ia_habilitada'] = $property['ai_enabled'];
                } else {
                    $attributes['ia_habilitada'] = $property['ai_enabled'];
                }
            }
            $block->fields()->where('clave', $property['key'])->update($attributes);
        }
        $block->update([
            'titulo' => $request->has('title') ? $request->string('title')->trim()->value() : $block->titulo,
            'configuracion' => [...($block->configuracion ?? []), 'detached_fields' => $detached],
        ]);
        if ($block->configuredContentType() === 'flow' && $request->has('title')) {
            $block->fields()->first()?->update(['etiqueta' => $block->titulo]);
        }
    }

    /** @param array<string, mixed> $document
     * @param  list<array<string, mixed>>  $properties
     * @return array<string, mixed>
     */
    private function applyPropertyLabels(array $document, array $properties): array
    {
        $labels = [];
        foreach ($properties as $property) {
            $labels[$property['key']] = trim($property['label']);
        }
        $visit = function (array $node) use (&$visit, $labels): array {
            if (in_array($node['type'] ?? null, ['field', 'column'], true)
                && isset($labels[$node['attrs']['key'] ?? null])) {
                $node['attrs']['label'] = $labels[$node['attrs']['key']];
            }
            if (isset($node['content'])) {
                $node['content'] = array_map($visit, $node['content']);
            }

            return $node;
        };

        return $visit($document);
    }

    private function auditDesign(TemplateBlock $block, User $actor, Request $request, int $fields): void
    {
        $this->audit->execute(
            actorId: $actor->id,
            roleAssignmentId: $this->roles->resolve($request)?->id,
            action: 'plantilla.diseno_actualizado', resourceType: 'bloque_plantilla',
            resourceId: $block->id, result: 'exito',
            correlationId: $request->attributes->getString('correlation_id') ?: null,
            metadata: ['fields' => $fields],
        );
    }
}
