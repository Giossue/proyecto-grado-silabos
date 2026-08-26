<?php

namespace App\Modules\Configuration\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateBlock;
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

            $blockId = $this->stringValue($data, 'block_id');
            $block = TemplateBlock::query()
                ->whereKey($blockId)
                ->where('version_plantilla_id', $version->id)
                ->firstOrFail();
            $inherited = (bool) ($data['inherited'] ?? false);
            $attributes = [
                'version_plantilla_id' => $version->id,
                'bloque_plantilla_id' => $block->id,
                'clave' => $data['key'],
                'etiqueta' => $data['label'],
                'ayuda' => $data['help'] ?? null,
                'tipo' => $data['type'],
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
    private function stringValue(array $data, string $key): string
    {
        $value = $data[$key] ?? null;

        if (! is_string($value)) {
            throw ValidationException::withMessages([$key => 'El identificador no es válido.']);
        }

        return $value;
    }
}
