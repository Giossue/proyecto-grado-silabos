<?php

namespace App\Modules\Academic\Application\Actions;

use App\Models\User;
use App\Modules\Academic\Application\AcademicPeriodPlanning;
use App\Modules\Academic\Domain\AcademicStructurePermissions;
use App\Modules\Academic\Infrastructure\Persistence\Models\Parallel;
use App\Modules\Academic\Infrastructure\Persistence\Models\ScheduledSubject;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\ProcessLocks;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Alta atómica de paralelos de una sola programación de asignatura. */
class CreateParallels
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly ProcessLocks $locks,
        private readonly AcademicPeriodPlanning $periodPlanning,
    ) {}

    /**
     * @param  array{scheduled_subject_id: string, codes: list<string>, shift?: string|null}  $data
     */
    public function execute(array $data, User $actor, Request $request): int
    {
        $activeRole = $this->roles->resolve($request);
        if (! $activeRole instanceof RoleAssignment
            || $activeRole->carrera_id === null
            || ! AcademicStructurePermissions::mayCreate($activeRole, 'paralelo')) {
            throw new AuthorizationException('No puede crear paralelos con el rol activo.');
        }
        $this->locks->assertCareerEditable($activeRole->carrera_id);

        return DB::transaction(function () use ($data, $actor, $request, $activeRole): int {
            $scheduledSubject = ScheduledSubject::query()
                ->whereKey($data['scheduled_subject_id'])
                ->where('activo', true)
                ->whereHas('subject.curriculum', fn ($query) => $query
                    ->where('carrera_id', $activeRole->carrera_id)
                    ->where('estado', 'activa'))
                ->lockForUpdate()
                ->firstOrFail();
            $this->periodPlanning->assertScheduledSubjectMayChange($scheduledSubject, 'scheduled_subject_id');
            $codes = collect($data['codes'])
                ->map(fn (string $code) => trim($code))
                ->values();
            $existing = Parallel::query()
                ->where('programacion_asignatura_id', $scheduledSubject->id)
                ->whereIn('codigo', $codes)
                ->pluck('codigo');

            if ($existing->isNotEmpty()) {
                throw ValidationException::withMessages([
                    'codes' => 'Ya existe el paralelo '.$existing->join(', ').' para esta materia programada.',
                ]);
            }

            $correlationId = $request->attributes->getString('correlation_id') ?: null;
            foreach ($codes as $code) {
                $parallel = Parallel::query()->create([
                    'programacion_asignatura_id' => $scheduledSubject->id,
                    'codigo' => $code,
                    'jornada' => $data['shift'] ?? null,
                    'activo' => true,
                ]);
                $this->audit->execute(
                    actorId: $actor->id,
                    roleAssignmentId: $activeRole->id,
                    action: 'academico.paralelo.creacion',
                    resourceType: 'paralelo',
                    resourceId: $parallel->id,
                    result: 'exito',
                    metadata: ['bulk' => true],
                    correlationId: $correlationId,
                );
            }

            return $codes->count();
        });
    }
}
