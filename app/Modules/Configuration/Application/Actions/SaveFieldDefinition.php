<?php

namespace App\Modules\Configuration\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateBlock;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateSection;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateVersion;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SaveFieldDefinition
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    /** @param array<string, mixed> $data */
    public function create(string $versionId, array $data, User $actor, Request $request): FieldDefinition
    {
        return $this->persist(null, $versionId, $data, $actor, $request);
    }

    /** @param array<string, mixed> $data */
    public function update(FieldDefinition $field, array $data, User $actor, Request $request): FieldDefinition
    {
        return $this->persist($field, $field->version_plantilla_id, $data, $actor, $request);
    }

    /** @param array<string, mixed> $data */
    private function persist(
        ?FieldDefinition $field,
        string $versionId,
        array $data,
        User $actor,
        Request $request,
    ): FieldDefinition {
        $activeRole = $this->roles->resolve($request);

        return DB::transaction(function () use ($actor, $activeRole, $data, $field, $request, $versionId): FieldDefinition {
            $version = TemplateVersion::query()->whereKey($versionId)->lockForUpdate()->firstOrFail();

            if ($version->estado !== 'draft') {
                throw ValidationException::withMessages(['field' => 'La versión publicada no admite cambios.']);
            }

            $contentType = $this->stringValue($data, 'content_type');
            $block = $field === null
                ? $this->createBlock($version, $data, $contentType)
                : $this->updateBlock($field, $version, $data, $contentType);
            $inherited = (bool) ($data['inherited'] ?? false);
            $attributes = [
                'version_plantilla_id' => $version->id,
                'bloque_plantilla_id' => $block->id,
                'clave' => $data['key'],
                'etiqueta' => $data['label'],
                'ayuda' => $data['help'] ?? null,
                'tipo' => $this->fieldType($contentType),
                'obligatorio' => (bool) ($data['required'] ?? false),
                'heredado' => $inherited,
                'origen_maestro' => $inherited ? ($data['master_source'] ?? null) : null,
                'editable_docente' => $inherited ? false : (bool) ($data['teacher_editable'] ?? true),
                'ia_habilitada' => (bool) ($data['ai_enabled'] ?? false),
                'reglas' => $data['rules'] ?? null,
                'opciones' => $data['options'] ?? null,
                'marcador_documento' => $data['document_marker'] ?? null,
            ];

            if ($field === null) {
                $attributes['posicion'] = ((int) FieldDefinition::query()
                    ->where('bloque_plantilla_id', $block->id)
                    ->max('posicion')) + 1;
                $field = FieldDefinition::query()->create($attributes);
                $action = 'template.field_created';
            } else {
                $field->update($attributes);
                $action = 'template.field_updated';
            }

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: $action,
                resourceType: 'field_definition',
                resourceId: $field->id,
                result: 'success',
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $field;
        });
    }

    /** @param array<string, mixed> $data */
    private function createBlock(TemplateVersion $version, array $data, string $contentType): TemplateBlock
    {
        $sectionId = $this->stringValue($data, 'section_id');
        $section = TemplateSection::query()
            ->whereKey($sectionId)
            ->where('version_plantilla_id', $version->id)
            ->firstOrFail();

        $blocks = TemplateBlock::query()
            ->where('seccion_plantilla_id', $section->id)
            ->orderBy('posicion')
            ->lockForUpdate()
            ->get()
            ->values();
        $position = min(
            max(1, ((int) ($data['position'] ?? $blocks->count() + 1))),
            $blocks->count() + 1,
        );
        $temporaryPosition = ((int) $blocks->max('posicion')) + $blocks->count() + 2;

        foreach ($blocks as $index => $existingBlock) {
            $existingBlock->update(['posicion' => $temporaryPosition + $index]);
        }

        foreach ($blocks as $index => $existingBlock) {
            $existingBlock->update([
                'posicion' => $index < $position - 1 ? $index + 1 : $index + 2,
            ]);
        }

        return TemplateBlock::query()->create([
            'version_plantilla_id' => $version->id,
            'seccion_plantilla_id' => $section->id,
            'clave' => $data['key'],
            'tipo' => $this->blockType($contentType),
            'titulo' => $data['label'],
            'configuracion' => ['content_type' => $contentType],
            'posicion' => $position,
        ]);
    }

    /** @param array<string, mixed> $data */
    private function updateBlock(
        FieldDefinition $field,
        TemplateVersion $version,
        array $data,
        string $contentType,
    ): TemplateBlock {
        $blockId = $this->stringValue($data, 'block_id');
        $block = TemplateBlock::query()
            ->whereKey($blockId)
            ->where('version_plantilla_id', $version->id)
            ->firstOrFail();
        abort_unless($block->id === $field->bloque_plantilla_id, 404);

        $configuration = $block->getAttribute('configuracion');

        $block->update([
            'tipo' => $this->blockType($contentType),
            'titulo' => $data['label'],
            'configuracion' => [
                ...(is_array($configuration) ? $configuration : []),
                'content_type' => $contentType,
            ],
        ]);

        return $block;
    }

    private function blockType(string $contentType): string
    {
        return $contentType === 'institutional'
            ? 'workflow'
            : ($contentType === 'text' ? 'narrative' : 'repeatable');
    }

    private function fieldType(string $contentType): string
    {
        return match ($contentType) {
            'text' => 'markdown',
            'institutional' => 'master_reference',
            default => 'repeatable',
        };
    }

    /** @param array<string, mixed> $data */
    private function stringValue(array $data, string $key): string
    {
        $value = $data[$key] ?? null;

        if (! is_string($value)) {
            throw ValidationException::withMessages([$key => 'El identificador no es válido.']);
        }

        return $value;
    }
}
