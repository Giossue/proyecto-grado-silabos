<?php

namespace App\Modules\Configuration\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateBlock;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\InProgressWork;
use App\Modules\Syllabus\Application\ProcessLocks;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DeleteTemplateBlock
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly ProcessLocks $locks,
        private readonly InProgressWork $work,
    ) {}

    public function execute(TemplateBlock $block, User $actor, Request $request): void
    {
        $activeRole = $this->roles->resolve($request);
        // Con el proceso institucional abierto, el formato está en uso: se pausa antes.
        $this->locks->assertTemplateEditable();

        DB::transaction(function () use ($activeRole, $actor, $block, $request): void {
            // Un bloque menos cambia el formato que los docentes están llenando.
            $this->work->requireConfirmation($request);

            $block->delete();

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'plantilla.bloque_eliminado',
                resourceType: 'bloque_plantilla',
                resourceId: $block->id,
                result: 'exito',
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );
        });
    }
}
