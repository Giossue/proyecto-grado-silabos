<?php

namespace App\Modules\Academic\Application\Actions;

use App\Models\User;
use App\Modules\Academic\Domain\AcademicStructurePermissions;
use App\Modules\Academic\Infrastructure\Persistence\Models\CourseOffering;
use App\Modules\Academic\Infrastructure\Persistence\Models\CurriculumVersion;
use App\Modules\Academic\Infrastructure\Persistence\Models\SubjectRequirement;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class DeleteCurriculum
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    public function execute(string $curriculumId, User $actor, Request $request): void
    {
        $role = $this->roles->resolve($request);
        if (! $role instanceof RoleAssignment
            || ! AcademicStructurePermissions::isCareerContext($role)
            || $role->carrera_id === null) {
            throw new AuthorizationException('Solo la coordinación vigente puede eliminar la malla.');
        }

        DB::transaction(function () use ($actor, $curriculumId, $request, $role): void {
            $curriculum = CurriculumVersion::query()
                ->where('carrera_id', $role->carrera_id)
                ->current()
                ->with('subjects:id,version_malla_id')
                ->lockForUpdate()
                ->findOrFail($curriculumId);
            $subjectIds = $curriculum->subjects->pluck('id');

            $hasSyllabi = Syllabus::query()->where('version_malla_id', $curriculum->id)->exists();
            $hasOfferings = CourseOffering::query()->whereIn('asignatura_id', $subjectIds)->exists();
            if ($hasSyllabi || $hasOfferings) {
                throw ValidationException::withMessages([
                    'curriculum' => 'La malla tiene ofertas o sílabos relacionados y no puede eliminarse. Deshabilítela para bloquear procesos nuevos sin perder el historial.',
                ]);
            }

            SubjectRequirement::query()
                ->whereIn('asignatura_id', $subjectIds)
                ->orWhereIn('requisito_id', $subjectIds)
                ->delete();
            $curriculum->subjects()->delete();
            $curriculum->delete();

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $role->id,
                action: 'academic.curriculum.deleted',
                resourceType: 'curriculum',
                resourceId: $curriculumId,
                result: 'success',
                metadata: ['code' => $curriculum->codigo],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );
        });
    }
}
