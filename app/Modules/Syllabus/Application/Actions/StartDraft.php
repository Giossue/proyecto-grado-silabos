<?php

namespace App\Modules\Syllabus\Application\Actions;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StartDraft
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    public function execute(string $syllabusId, User $actor, Request $request): Syllabus
    {
        return DB::transaction(function () use ($actor, $request, $syllabusId): Syllabus {
            $syllabus = Syllabus::query()->lockForUpdate()->findOrFail($syllabusId);
            if ($syllabus->estado !== 'sin_iniciar') {
                throw ValidationException::withMessages(['syllabus' => 'El borrador ya fue iniciado o no está editable.']);
            }
            $syllabus->update(['estado' => 'borrador', 'iniciado_en' => now(), 'guardado_en' => now(), 'version_bloqueo' => 1]);
            $activeRole = $this->roles->resolve($request);
            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'silabo.borrador_iniciado',
                resourceType: 'silabo',
                resourceId: $syllabus->id,
                result: 'exito',
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $syllabus;
        });
    }
}
