<?php

namespace App\Modules\Academic\Application\Actions;

use App\Models\User;
use App\Modules\Academic\Domain\AcademicStructurePermissions;
use App\Modules\Academic\Infrastructure\Persistence\Models\AcademicPeriod;
use App\Modules\Academic\Infrastructure\Persistence\Models\Campus;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\CoordinatorAssignment;
use App\Modules\Academic\Infrastructure\Persistence\Models\CourseOffering;
use App\Modules\Academic\Infrastructure\Persistence\Models\CurriculumVersion;
use App\Modules\Academic\Infrastructure\Persistence\Models\Faculty;
use App\Modules\Academic\Infrastructure\Persistence\Models\Modality;
use App\Modules\Academic\Infrastructure\Persistence\Models\Parallel;
use App\Modules\Academic\Infrastructure\Persistence\Models\Subject;
use App\Modules\Academic\Infrastructure\Persistence\Models\TeacherAssignment;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SetAcademicRecordStatus
{
    /** @var array<string, class-string<Model>> */
    private const MODELS = [
        'faculty' => Faculty::class,
        'career' => Career::class,
        'campus' => Campus::class,
        'modality' => Modality::class,
        'period' => AcademicPeriod::class,
        'curriculum' => CurriculumVersion::class,
        'subject' => Subject::class,
        'offering' => CourseOffering::class,
        'parallel' => Parallel::class,
        'coordinator_assignment' => CoordinatorAssignment::class,
        'teacher_assignment' => TeacherAssignment::class,
    ];

    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    public function execute(
        string $entity,
        string $recordId,
        bool $active,
        User $actor,
        Request $request,
    ): Model {
        $modelClass = self::MODELS[$entity] ?? null;

        if ($modelClass === null) {
            throw ValidationException::withMessages(['entity' => 'El tipo de registro no admite este cambio.']);
        }

        $activeRole = $this->roles->resolve($request);

        if (! $activeRole instanceof RoleAssignment || ! AcademicStructurePermissions::mayChangeStatus($activeRole, $entity)) {
            throw new AuthorizationException('No puede cambiar este registro con el rol activo.');
        }

        return DB::transaction(function () use ($active, $actor, $activeRole, $entity, $modelClass, $recordId, $request): Model {
            $record = AcademicStructurePermissions::isCareerContext($activeRole)
                ? $this->findCareerRecord($entity, $recordId, $activeRole->carrera_id)
                : $modelClass::query()->lockForUpdate()->findOrFail($recordId);

            if (! $active) {
                $this->ensureMayDeactivate($entity, $recordId);
            }

            $record->update($entity === 'curriculum'
                ? ['estado' => $active ? 'active' : 'inactive']
                : ['activo' => $active]);

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole->id,
                action: "academic.{$entity}.status_changed",
                resourceType: $entity,
                resourceId: (string) $record->getKey(),
                result: 'success',
                metadata: ['active' => $active],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $record;
        });
    }

    private function findCareerRecord(string $entity, string $recordId, ?string $careerId): Model
    {
        if ($careerId === null) {
            throw new AuthorizationException('Seleccione una coordinación vigente con carrera.');
        }

        return match ($entity) {
            'curriculum' => CurriculumVersion::query()
                ->where('carrera_id', $careerId)
                ->current()
                ->lockForUpdate()
                ->findOrFail($recordId),
            'subject' => Subject::query()->whereHas(
                'curriculumVersion',
                fn ($query) => $query->where('carrera_id', $careerId)->where('es_actual', true),
            )->lockForUpdate()->findOrFail($recordId),
            'offering' => CourseOffering::query()->whereHas(
                'subject.curriculumVersion',
                fn ($query) => $query->where('carrera_id', $careerId)->where('es_actual', true),
            )->lockForUpdate()->findOrFail($recordId),
            'parallel' => Parallel::query()->whereHas(
                'offering.subject.curriculumVersion',
                fn ($query) => $query->where('carrera_id', $careerId)->where('es_actual', true),
            )->lockForUpdate()->findOrFail($recordId),
            'teacher_assignment' => TeacherAssignment::query()->whereHas(
                'parallel.offering.subject.curriculumVersion',
                fn ($query) => $query->where('carrera_id', $careerId)->where('es_actual', true),
            )->lockForUpdate()->findOrFail($recordId),
            default => throw new AuthorizationException('El registro no pertenece a la gestión de carrera.'),
        };
    }

    private function ensureMayDeactivate(string $entity, string $recordId): void
    {
        $hasActiveDependants = match ($entity) {
            'faculty' => Career::query()->where('facultad_id', $recordId)->where('activo', true)->exists(),
            'career' => CurriculumVersion::query()->where('carrera_id', $recordId)->current()->active()->exists(),
            'curriculum' => false,
            'campus' => CourseOffering::query()->where('campus_id', $recordId)->where('activo', true)->exists(),
            'modality' => CourseOffering::query()->where('modalidad_id', $recordId)->where('activo', true)->exists(),
            'period' => CourseOffering::query()->where('periodo_academico_id', $recordId)->where('activo', true)->exists(),
            'subject' => CourseOffering::query()->where('asignatura_id', $recordId)->where('activo', true)->exists(),
            'offering' => Parallel::query()->where('oferta_academica_id', $recordId)->where('activo', true)->exists(),
            'parallel' => TeacherAssignment::query()->where('paralelo_id', $recordId)->where('activo', true)->exists(),
            default => false,
        };

        if ($hasActiveDependants) {
            throw ValidationException::withMessages([
                'record' => 'Archive primero los registros activos que dependen de este elemento.',
            ]);
        }
    }
}
