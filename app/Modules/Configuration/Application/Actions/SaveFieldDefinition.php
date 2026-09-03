<?php

namespace App\Modules\Configuration\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateBlock;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateSection;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\InProgressWork;
use App\Modules\Syllabus\Application\ProcessLocks;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SaveFieldDefinition
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly ProcessLocks $locks,
        private readonly InProgressWork $work,
    ) {}

    /** @param array<string, mixed> $data */
    public function create(string $templateId, array $data, User $actor, Request $request): FieldDefinition
    {
        $this->locks->assertTemplateEditable();

        return $this->persist(null, $templateId, $data, $actor, $request);
    }

    /** @param array<string, mixed> $data */
    public function update(FieldDefinition $field, array $data, User $actor, Request $request): FieldDefinition
    {
        $this->locks->assertTemplateEditable();

        return $this->persist($field, $field->plantilla_id, $data, $actor, $request);
    }

    /** @param array<string, mixed> $data */
    private function persist(
        ?FieldDefinition $field,
        string $templateId,
        array $data,
        User $actor,
        Request $request,
    ): FieldDefinition {
        $activeRole = $this->roles->resolve($request);

        return DB::transaction(function () use ($actor, $activeRole, $data, $field, $request, $templateId): FieldDefinition {
            $template = SyllabusTemplate::query()->whereKey($templateId)->lockForUpdate()->firstOrFail();
            // Un campo nuevo o cambiado altera el formato que los docentes están llenando.
            $this->work->requireConfirmation($request);

            $contentType = $this->stringValue($data, 'content_type');

            // Bloques fijos (ficha de identificación, estado de revisión): su estructura no
            // se toca; solo cambian etiqueta y ayuda.
            if ($field !== null && in_array($contentType, ['institutional', 'flow'], true)) {
                $field->update(['etiqueta' => $data['label'], 'ayuda' => $data['help'] ?? null]);
                TemplateBlock::query()->whereKey($field->bloque_plantilla_id)->update(['titulo' => $data['label']]);
                $this->auditField($field, 'plantilla.campo_actualizado', $actor, $activeRole?->id, $request);

                return $field;
            }

            $block = $field === null
                ? $this->createBlock($template, $data, $contentType)
                : $this->updateBlock($field, $template, $data, $contentType);
            // Todo campo es obligatorio y lo llena el docente salvo lo heredado de la
            // malla, que nace así con la plantilla y no se cambia desde aquí (I-33).
            $inherited = $field !== null && $field->heredado;
            $attributes = [
                'plantilla_id' => $template->id,
                'bloque_plantilla_id' => $block->id,
                'clave' => $data['key'],
                'etiqueta' => $data['label'],
                'ayuda' => $data['help'] ?? null,
                'tipo' => $this->fieldType($contentType),
                'obligatorio' => true,
                'heredado' => $inherited,
                'origen_maestro' => $field !== null && $field->heredado ? $field->origen_maestro : null,
                'editable_docente' => ! $inherited,
                'ia_habilitada' => ! $inherited && (bool) ($data['ai_enabled'] ?? ($field !== null ? $field->ia_habilitada : false)),
                'reglas' => $data['rules'] ?? ($field !== null ? $field->reglas : null),
                'opciones' => $data['options'] ?? ($field !== null ? $field->opciones : null),
                'marcador_documento' => $field !== null ? $field->marcador_documento : null,
            ];

            if ($field === null) {
                $attributes['posicion'] = ((int) FieldDefinition::query()
                    ->where('bloque_plantilla_id', $block->id)
                    ->max('posicion')) + 1;
                $field = FieldDefinition::query()->create($attributes);
                $action = 'plantilla.campo_creado';
            } else {
                $field->update($attributes);
                $action = 'plantilla.campo_actualizado';
            }

            $this->auditField($field, $action, $actor, $activeRole?->id, $request);

            return $field;
        });
    }

    private function auditField(FieldDefinition $field, string $action, User $actor, ?string $roleAssignmentId, Request $request): void
    {
        $this->audit->execute(
            actorId: $actor->id,
            roleAssignmentId: $roleAssignmentId,
            action: $action,
            resourceType: 'definicion_campo',
            resourceId: $field->id,
            result: 'exito',
            correlationId: $request->attributes->getString('correlation_id') ?: null,
        );
    }

    /** @param array<string, mixed> $data */
    private function createBlock(SyllabusTemplate $template, array $data, string $contentType): TemplateBlock
    {
        $sectionId = $this->stringValue($data, 'section_id');
        $section = TemplateSection::query()
            ->whereKey($sectionId)
            ->where('plantilla_id', $template->id)
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
            'plantilla_id' => $template->id,
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
        SyllabusTemplate $template,
        array $data,
        string $contentType,
    ): TemplateBlock {
        $blockId = $this->stringValue($data, 'block_id');
        $block = TemplateBlock::query()
            ->whereKey($blockId)
            ->where('plantilla_id', $template->id)
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
            ? 'flujo'
            : ($contentType === 'text' ? 'narrativa' : 'repetible');
    }

    private function fieldType(string $contentType): string
    {
        return match ($contentType) {
            'text' => 'markdown',
            'institutional' => 'referencia_maestra',
            default => 'repetible',
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
