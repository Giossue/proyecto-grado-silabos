<?php

namespace App\Modules\Configuration\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateSection;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\ProcessLocks;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ReorderTemplateSections
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly ProcessLocks $locks,
    ) {}

    /** @param array<int, string> $sectionIds */
    public function execute(SyllabusTemplate $template, array $sectionIds, User $actor, Request $request): void
    {
        $activeRole = $this->roles->resolve($request);
        // Con el proceso institucional abierto, el formato está en uso: se pausa antes.
        $this->locks->assertTemplateEditable();

        DB::transaction(function () use ($activeRole, $actor, $request, $sectionIds, $template): void {
            $lockedTemplate = SyllabusTemplate::query()->whereKey($template->id)->lockForUpdate()->firstOrFail();

            $sections = TemplateSection::query()
                ->where('plantilla_id', $lockedTemplate->id)
                ->lockForUpdate()
                ->get();

            if ($sections->count() !== count($sectionIds) || $sections->pluck('id')->sort()->values()->all() !== collect($sectionIds)->sort()->values()->all()) {
                throw ValidationException::withMessages(['sections' => 'El orden de bloques no es válido.']);
            }

            $temporaryPosition = ((int) $sections->max('posicion')) + $sections->count() + 1;

            foreach ($sections->values() as $position => $section) {
                $section->update(['posicion' => $temporaryPosition + $position]);
            }

            foreach ($sectionIds as $position => $sectionId) {
                $sections->firstWhere('id', $sectionId)?->update(['posicion' => $position + 1]);
            }

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'plantilla.secciones_reordenadas',
                resourceType: 'plantilla_silabo',
                resourceId: $lockedTemplate->id,
                result: 'exito',
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );
        });
    }
}
