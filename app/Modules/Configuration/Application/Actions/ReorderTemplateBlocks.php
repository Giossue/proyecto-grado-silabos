<?php

namespace App\Modules\Configuration\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateBlock;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateVersion;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ReorderTemplateBlocks
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    /** @param array<int, string> $blockIds */
    public function execute(
        TemplateVersion $version,
        string $sectionId,
        array $blockIds,
        User $actor,
        Request $request,
    ): void {
        $activeRole = $this->roles->resolve($request);

        DB::transaction(function () use ($activeRole, $actor, $blockIds, $request, $sectionId, $version): void {
            $lockedVersion = TemplateVersion::query()->whereKey($version->id)->lockForUpdate()->firstOrFail();

            if ($lockedVersion->estado !== 'draft') {
                throw ValidationException::withMessages(['blocks' => 'La versión publicada no admite cambios.']);
            }

            $blocks = TemplateBlock::query()
                ->where('version_plantilla_id', $lockedVersion->id)
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
                action: 'template.blocks_reordered',
                resourceType: 'template_version',
                resourceId: $lockedVersion->id,
                result: 'success',
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );
        });
    }
}
