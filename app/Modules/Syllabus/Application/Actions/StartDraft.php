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
            if ($syllabus->estado !== 'not_started') {
                throw ValidationException::withMessages(['syllabus' => 'El borrador ya fue iniciado o no está editable.']);
            }
            $syllabus->update(['estado' => 'draft', 'iniciado_en' => now(), 'guardado_en' => now(), 'lock_version' => 1]);
            $activeRole = $this->roles->resolve($request);
            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'syllabus.draft_started',
                resourceType: 'syllabus',
                resourceId: $syllabus->id,
                result: 'success',
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $syllabus;
        });
    }
}
