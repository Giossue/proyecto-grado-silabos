<?php

namespace App\Modules\Configuration\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Domain\TemplateAppearance;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\InProgressWork;
use App\Modules\Syllabus\Application\ProcessLocks;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class SaveTemplateAppearance
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly ProcessLocks $locks,
        private readonly InProgressWork $work,
    ) {}

    /** @param array<string, mixed> $appearance */
    public function execute(SyllabusTemplate $template, array $appearance, User $actor, Request $request): void
    {
        abort_unless($actor->can('manage-templates'), 403);
        $activeRole = $this->roles->resolve($request);
        $this->locks->assertTemplateEditable();

        DB::transaction(function () use ($activeRole, $actor, $appearance, $request, $template): void {
            $locked = SyllabusTemplate::query()->whereKey($template->id)->lockForUpdate()->firstOrFail();
            $this->work->requireConfirmation($request);
            $mapping = $locked->mapeo_documento ?? [];
            $mapping['appearance'] = TemplateAppearance::normalize($appearance);
            $locked->update(['mapeo_documento' => $mapping]);

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'plantilla.apariencia_actualizada',
                resourceType: 'plantilla_silabo',
                resourceId: $locked->id,
                result: 'exito',
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );
        });
    }
}
