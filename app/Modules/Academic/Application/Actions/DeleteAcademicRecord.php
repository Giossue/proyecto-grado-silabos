<?php

namespace App\Modules\Academic\Application\Actions;

use App\Models\User;
use App\Modules\Academic\Domain\AcademicStructurePermissions;
use App\Modules\Academic\Infrastructure\Persistence\Models\AcademicPeriod;
use App\Modules\Academic\Infrastructure\Persistence\Models\Campus;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\CourseOffering;
use App\Modules\Academic\Infrastructure\Persistence\Models\Faculty;
use App\Modules\Academic\Infrastructure\Persistence\Models\Parallel;
use App\Modules\Academic\Infrastructure\Persistence\Models\TeacherAssignment;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\ProcessLocks;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusCollaborator;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusScope;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * El borrado se permite solo antes de que un registro entre a un expediente. Así no
 * existe un estado oculto que esconda datos: lo prescindible desaparece y la historia queda
 * protegida por sus propias relaciones.
 */
class DeleteAcademicRecord
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly ProcessLocks $locks,
    ) {}

    public function execute(string $entity, string $recordId, User $actor, Request $request): void
    {
        $role = $this->roles->resolve($request);
        if (! $role instanceof RoleAssignment) {
            throw new AuthorizationException('Seleccione un rol vigente.');
        }

        if (AcademicStructurePermissions::isGovernanceContext($role)) {
            if (! in_array($entity, ['facultad', 'carrera', 'campus', 'periodo'], true)) {
                throw new AuthorizationException('Este registro no pertenece a la estructura institucional.');
            }
            $this->locks->assertInstitutionalStructureEditable();
        } elseif (AcademicStructurePermissions::isCareerContext($role) && $role->carrera_id !== null) {
            if (! in_array($entity, ['paralelo', 'asignacion_docente'], true)) {
                throw new AuthorizationException('Este registro no admite eliminación desde Coordinación.');
            }
            $this->locks->assertCareerEditable($role->carrera_id);
        } else {
            throw new AuthorizationException('No puede eliminar este registro con el rol activo.');
        }

        DB::transaction(function () use ($actor, $entity, $recordId, $request, $role): void {
            $record = AcademicStructurePermissions::isGovernanceContext($role)
                ? match ($entity) {
                    'facultad' => Faculty::query()->lockForUpdate()->findOrFail($recordId),
                    'carrera' => Career::query()->lockForUpdate()->findOrFail($recordId),
                    'campus' => Campus::query()->lockForUpdate()->findOrFail($recordId),
                    'periodo' => AcademicPeriod::query()->lockForUpdate()->findOrFail($recordId),
                    default => throw new \LogicException('Entidad institucional no admitida.'),
                }
            : match ($entity) {
                'paralelo' => Parallel::query()
                    ->whereHas('offering.subject.curriculum', fn ($query) => $query->where('carrera_id', $role->carrera_id))
                    ->lockForUpdate()->findOrFail($recordId),
                'asignacion_docente' => TeacherAssignment::query()
                    ->whereHas('parallel.offering.subject.curriculum', fn ($query) => $query->where('carrera_id', $role->carrera_id))
                    ->lockForUpdate()->findOrFail($recordId),
                default => throw new \LogicException('Entidad de carrera no admitida.'),
            };

            $this->assertDeletable($entity, $record);
            $metadata = $this->delete($entity, $record);

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $role->id,
                action: "academico.{$entity}.eliminacion",
                resourceType: $entity,
                resourceId: $recordId,
                result: 'exito',
                metadata: $metadata,
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );
        });
    }

    private function assertDeletable(string $entity, Model $record): void
    {
        $hasDependencies = match ($entity) {
            'facultad' => Career::query()->where('facultad_id', $record->getKey())->exists(),
            'carrera' => DB::table('mallas')->where('carrera_id', $record->getKey())->exists()
                || DB::table('fuentes_academicas')->where('carrera_id', $record->getKey())->exists()
                || DB::table('convocatorias_carreras')->where('carrera_id', $record->getKey())->exists()
                || DB::table('asignaciones_coordinador')->where('carrera_id', $record->getKey())->exists()
                || DB::table('asignaciones_rol')->where('carrera_id', $record->getKey())->exists(),
            'campus' => Career::query()->where('campus_id', $record->getKey())->exists()
                || CourseOffering::query()->where('campus_id', $record->getKey())->exists(),
            'periodo' => CourseOffering::query()->where('periodo_academico_id', $record->getKey())->exists()
                || DB::table('convocatorias_universidad')->where('periodo_academico_id', $record->getKey())->exists()
                || DB::table('convocatorias_carreras')->where('periodo_academico_id', $record->getKey())->exists(),
            'paralelo' => SyllabusScope::query()->where('paralelo_id', $record->getKey())->exists()
                || SyllabusCollaborator::query()->whereHas('teacherAssignment', fn ($query) => $query->where('paralelo_id', $record->getKey()))->exists(),
            'asignacion_docente' => SyllabusCollaborator::query()->where('asignacion_docente_id', $record->getKey())->exists(),
            default => true,
        };

        if ($hasDependencies) {
            throw ValidationException::withMessages([
                'record' => 'No se puede eliminar porque ya tiene registros dependientes o historia académica. Revise las consecuencias y conserve ese historial.',
            ]);
        }
    }

    /** @return array<string, int|string> */
    private function delete(string $entity, Model $record): array
    {
        if ($entity === 'paralelo') {
            $assignmentIds = TeacherAssignment::query()
                ->where('paralelo_id', $record->getKey())
                ->lockForUpdate()
                ->pluck('id');
            TeacherAssignment::query()->whereIn('id', $assignmentIds)->delete();
            $record->delete();

            return ['deleted_teacher_assignments' => $assignmentIds->count()];
        }

        $name = (string) ($record->getAttribute('nombre') ?? $record->getAttribute('codigo') ?? $record->getKey());
        $record->delete();

        return ['name' => $name];
    }
}
