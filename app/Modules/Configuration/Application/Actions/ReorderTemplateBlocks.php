<?php

namespace App\Modules\Configuration\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateBlock;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\ProcessLocks;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ReorderTemplateBlocks
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly ProcessLocks $locks,
    ) {}

    /** @param array<int, string> $blockIds */
    public function execute(
        SyllabusTemplate $template,
        string $sectionId,
        array $blockIds,
        User $actor,
        Request $request,
    ): void {
        $activeRole = $this->roles->resolve($request);
        // Con el proceso institucional abierto, el formato está en uso: se pausa antes.
        $this->locks->assertTemplateEditable();

        DB::transaction(function () use ($activeRole, $actor, $blockIds, $request, $sectionId, $template): void {
            $lockedTemplate = SyllabusTemplate::query()->whereKey($template->id)->lockForUpdate()->firstOrFail();

            $blocks = TemplateBlock::query()
                ->where('plantilla_id', $lockedTemplate->id)
                ->where('seccion_plantilla_id', $sectionId)
                ->lockForUpdate()
                ->get();

            if ($blocks->count() !== count($blockIds) || $blocks->pluck('id')->sort()->values()->all() !== collect($blockIds)->sort()->values()->all()) {
                throw ValidationException::withMessages(['blocks' => 'El orden de bloques no es válido.']);
            }

            $temporaryPosition = ((int) $blocks->max('posicion')) + $blocks->count() + 1;

            foreach ($blocks->values() as $position => $block) {
                $block->update(['posicion' => $temporaryPosition + $position]);
            }

            foreach ($blockIds as $position => $blockId) {
                $blocks->firstWhere('id', $blockId)?->update(['posicion' => $position + 1]);
            }

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'plantilla.bloques_reordenados',
                resourceType: 'plantilla_silabo',
                resourceId: $lockedTemplate->id,
                result: 'exito',
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );
        });
    }
}
