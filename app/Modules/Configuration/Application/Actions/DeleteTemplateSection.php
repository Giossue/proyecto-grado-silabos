<?php

namespace App\Modules\Configuration\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateSection;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\InProgressWork;
use App\Modules\Syllabus\Application\ProcessLocks;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DeleteTemplateSection
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly ProcessLocks $locks,
        private readonly InProgressWork $work,
    ) {}

    public function execute(TemplateSection $section, User $actor, Request $request): void
    {
        $activeRole = $this->roles->resolve($request);
        // Con el proceso institucional abierto, el formato está en uso: se pausa antes.
        $this->locks->assertTemplateEditable();

        DB::transaction(function () use ($activeRole, $actor, $request, $section): void {
            // Una sección menos cambia el formato que los docentes están llenando.
            $this->work->requireConfirmation($request);

            $section->delete();

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'plantilla.seccion_eliminada',
                resourceType: 'seccion_plantilla',
                resourceId: $section->id,
                result: 'exito',
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );
        });
    }
}
