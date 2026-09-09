<?php

namespace App\Modules\Academic\Application\Actions;

use App\Models\User;
use App\Modules\Academic\Domain\AcademicStructurePermissions;
use App\Modules\Academic\Infrastructure\Persistence\Models\Parallel;
use App\Modules\Academic\Infrastructure\Persistence\Models\ScheduledSubject;
use App\Modules\Academic\Infrastructure\Persistence\Models\TeacherAssignment;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\ProcessLocks;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusCollaborator;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusScope;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class DeleteScheduledSubject
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly ProcessLocks $locks,
    ) {}

    public function execute(string $scheduledSubjectId, User $actor, Request $request): void
    {
        $role = $this->roles->resolve($request);
        if (! $role instanceof RoleAssignment
            || ! AcademicStructurePermissions::isCareerContext($role)
            || $role->carrera_id === null) {
            throw new AuthorizationException('Solo la coordinación activa puede eliminar materias programadas.');
        }
        $this->locks->assertCareerEditable($role->carrera_id);

        DB::transaction(function () use ($actor, $scheduledSubjectId, $request, $role): void {
            $scheduledSubject = ScheduledSubject::query()
                ->whereHas('subject.curriculum', fn ($query) => $query->where('carrera_id', $role->carrera_id))
                ->lockForUpdate()
                ->findOrFail($scheduledSubjectId);

            $parallelIds = Parallel::query()
                ->where('programacion_asignatura_id', $scheduledSubject->id)
                ->lockForUpdate()
                ->pluck('id');

            if (SyllabusScope::query()
                ->where('programacion_asignatura_id', $scheduledSubject->id)
                ->orWhereIn('paralelo_id', $parallelIds)
                ->exists()) {
                throw ValidationException::withMessages([
                    'scheduledSubject' => 'La materia programada tiene sílabos relacionados y no puede eliminarse. El historial institucional debe conservarse.',
                ]);
            }

            $assignmentIds = TeacherAssignment::query()
                ->whereIn('paralelo_id', $parallelIds)
                ->lockForUpdate()
                ->pluck('id');

            if (SyllabusCollaborator::query()->whereIn('asignacion_docente_id', $assignmentIds)->exists()) {
                throw ValidationException::withMessages([
                    'scheduledSubject' => 'La materia programada tiene asignaciones docentes con historia de sílabo y no puede eliminarse.',
                ]);
            }

            TeacherAssignment::query()->whereIn('id', $assignmentIds)->delete();
            Parallel::query()->whereIn('id', $parallelIds)->delete();
            $scheduledSubject->delete();

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $role->id,
                action: 'academico.programacion_asignatura.eliminacion',
                resourceType: 'programacion_asignatura',
                resourceId: $scheduledSubjectId,
                result: 'exito',
                metadata: [
                    'subject_id' => $scheduledSubject->asignatura_id,
                    'period_id' => $scheduledSubject->periodo_academico_id,
                    'deleted_parallels' => $parallelIds->count(),
                    'deleted_teacher_assignments' => $assignmentIds->count(),
                ],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );
        });
    }
}
