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

class SaveTemplateSection
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    /** @param array<string, mixed> $data */
    public function create(string $versionId, array $data, User $actor, Request $request): TemplateSection
    {
        $activeRole = $this->roles->resolve($request);

        return DB::transaction(function () use ($activeRole, $actor, $data, $request, $versionId): TemplateSection {
            $version = TemplateVersion::query()->whereKey($versionId)->lockForUpdate()->firstOrFail();
            $this->ensureDraft($version);

            $sections = TemplateSection::query()
                ->where('version_plantilla_id', $version->id)
                ->orderBy('posicion')
                ->lockForUpdate()
                ->get()
                ->values();
            $position = min(
                max(1, ((int) ($data['position'] ?? $sections->count() + 1))),
                $sections->count() + 1,
            );
            $temporaryPosition = ((int) $sections->max('posicion')) + $sections->count() + 2;

            foreach ($sections as $index => $existingSection) {
                $existingSection->update(['posicion' => $temporaryPosition + $index]);
            }

            foreach ($sections as $index => $existingSection) {
                $existingSection->update([
                    'posicion' => $index < $position - 1 ? $index + 1 : $index + 2,
                ]);
            }

            $section = TemplateSection::query()->create([
                'version_plantilla_id' => $version->id,
                'clave' => $this->stringValue($data, 'key'),
                'titulo' => $this->stringValue($data, 'title'),
                'posicion' => $position,
            ]);
            $contentType = $this->stringValue($data, 'first_field_content_type');
            $block = TemplateBlock::query()->create([
                'version_plantilla_id' => $version->id,
                'seccion_plantilla_id' => $section->id,
                'clave' => $section->clave.'_campos',
                'tipo' => $contentType === 'text' ? 'narrativa' : 'repetible',
                'titulo' => $this->stringValue($data, 'first_field_label'),
                'configuracion' => ['content_type' => $contentType],
                'posicion' => 1,
            ]);
            FieldDefinition::query()->create([
                'version_plantilla_id' => $version->id,
                'bloque_plantilla_id' => $block->id,
                'clave' => $this->stringValue($data, 'first_field_key'),
                'etiqueta' => $this->stringValue($data, 'first_field_label'),
                'tipo' => $contentType === 'text' ? 'markdown' : 'repetible',
                'obligatorio' => false,
                'heredado' => false,
                'editable_docente' => true,
                'ia_habilitada' => false,
                'posicion' => 1,
            ]);

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'plantilla.seccion_creada',
                resourceType: 'seccion_plantilla',
                resourceId: $section->id,
                result: 'exito',
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $section;
        });
    }

    /** @param array<string, mixed> $data */
    public function update(TemplateSection $section, array $data, User $actor, Request $request): TemplateSection
    {
        $activeRole = $this->roles->resolve($request);

        return DB::transaction(function () use ($activeRole, $actor, $data, $request, $section): TemplateSection {
            $section->load('version');
            $this->ensureDraft($section->version);
            $section->update(['titulo' => $this->stringValue($data, 'title')]);

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'plantilla.seccion_actualizada',
                resourceType: 'seccion_plantilla',
                resourceId: $section->id,
                result: 'exito',
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $section;
        });
    }

    private function ensureDraft(TemplateVersion $version): void
    {
        if ($version->estado !== 'borrador') {
            throw ValidationException::withMessages(['section' => 'La versión publicada no admite cambios.']);
        }
    }

    /** @param array<string, mixed> $data */
    private function stringValue(array $data, string $key): string
    {
        $value = $data[$key] ?? null;

        if (! is_string($value)) {
            throw ValidationException::withMessages([$key => 'El valor no es válido.']);
        }

        return $value;
    }
}
