<?php

namespace App\Modules\Academic\Application\Actions;

use App\Models\User;
use App\Modules\Academic\Application\AcademicPeriodPlanning;
use App\Modules\Academic\Application\ScheduledSubjectInheritance;
use App\Modules\Academic\Infrastructure\Persistence\Models\AcademicPeriod;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\Parallel;
use App\Modules\Academic\Infrastructure\Persistence\Models\ScheduledSubject;
use App\Modules\Academic\Infrastructure\Persistence\Models\Subject;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\ProcessLocks;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Programa las materias seleccionadas en un período con campus y modalidad heredados,
 * y crea los paralelos indicados. Una materia ya programada no vuelve a entrar por este
 * flujo: sus paralelos se agregan desde la programación existente.
 */
class PreparePeriod
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly ScheduledSubjectInheritance $inheritance,
        private readonly ProcessLocks $locks,
        private readonly AcademicPeriodPlanning $periodPlanning,
    ) {}

    /**
     * @param  array{period_id: string, subjects: list<array{id: string, parallels: list<array{code: string, shift?: string|null}>}>}  $data
     * @return array{scheduledSubjects: int, parallels: int, subjects: int}
     */
    public function execute(array $data, User $actor, Request $request): array
    {
        $activeRole = $this->roles->resolve($request);
        if (! $activeRole instanceof RoleAssignment || $activeRole->carrera_id === null) {
            throw new AuthorizationException('No puede preparar periodos con el rol activo.');
        }
        $careerId = $activeRole->carrera_id;
        $this->locks->assertCareerEditable($careerId);

        return DB::transaction(function () use ($actor, $activeRole, $careerId, $data, $request): array {
            $career = Career::query()->whereKey($careerId)->with('campus')->lockForUpdate()->firstOrFail();
            $period = AcademicPeriod::query()->whereKey($data['period_id'])->lockForUpdate()->firstOrFail();
            $this->periodPlanning->assertMayPlan($period);
            $campus = $this->inheritance->campusFor($career);
            $settingsBySubject = collect($data['subjects'])->keyBy('id');
            $subjectsQuery = Subject::query()
                ->where('activo', true)
                ->whereHas('curriculum', fn ($query) => $query->where('carrera_id', $careerId)->where('estado', 'activa'))
                ->with('curriculum.career')
                ->orderBy('ciclo')
                ->orderBy('orden_en_ciclo');
            $subjectsQuery->whereIn('id', $settingsBySubject->keys());
            $subjects = $subjectsQuery->get();
            if ($subjects->isEmpty()) {
                throw ValidationException::withMessages([
                    'period_id' => 'No hay materias activas seleccionadas en la malla de esta carrera.',
                ]);
            }
            if ($subjects->count() !== $settingsBySubject->count()) {
                throw ValidationException::withMessages([
                    'subjects' => 'Todas las materias seleccionadas deben estar activas y pertenecer a la malla de esta carrera.',
                ]);
            }

            $existing = ScheduledSubject::query()
                ->where('periodo_academico_id', $period->id)
                ->whereIn('asignatura_id', $subjects->pluck('id'))
                ->get()
                ->keyBy('asignatura_id');
            if ($existing->isNotEmpty()) {
                throw ValidationException::withMessages([
                    'subjects' => 'Las materias ya programadas no se pueden volver a incluir. Agregue sus paralelos desde Materias y paralelos.',
                ]);
            }
            $correlationId = $request->attributes->getString('correlation_id') ?: null;
            $scheduledSubjects = 0;
            $parallels = 0;

            foreach ($subjects as $subject) {
                $scheduledSubject = $existing->get($subject->id);
                if ($scheduledSubject === null) {
                    $scheduledSubject = ScheduledSubject::query()->create([
                        'periodo_academico_id' => $period->id,
                        'asignatura_id' => $subject->id,
                        'campus_id' => $campus->id,
                        'modalidad' => $this->inheritance->modalityFor($subject),
                        'activo' => true,
                    ]);
                    $this->audit->execute(
                        actorId: $actor->id,
                        roleAssignmentId: $activeRole->id,
                        action: 'academico.programacion_asignatura.creacion',
                        resourceType: 'programacion_asignatura',
                        resourceId: $scheduledSubject->id,
                        result: 'exito',
                        metadata: ['period_prepared' => true],
                        correlationId: $correlationId,
                    );
                    $scheduledSubjects++;
                }
                /** @var array{parallels: list<array{code: string, shift?: string|null}>} $setting */
                $setting = $settingsBySubject->get($subject->id);
                foreach ($setting['parallels'] as $parallelSetting) {
                    $parallel = Parallel::query()->create([
                        'programacion_asignatura_id' => $scheduledSubject->id,
                        'codigo' => $parallelSetting['code'],
                        'jornada' => $parallelSetting['shift'] ?? null,
                        'activo' => true,
                    ]);
                    $this->audit->execute(
                        actorId: $actor->id,
                        roleAssignmentId: $activeRole->id,
                        action: 'academico.paralelo.creacion',
                        resourceType: 'paralelo',
                        resourceId: $parallel->id,
                        result: 'exito',
                        metadata: ['period_prepared' => true, 'bulk' => true],
                        correlationId: $correlationId,
                    );
                    $parallels++;
                }
            }

            return ['scheduledSubjects' => $scheduledSubjects, 'parallels' => $parallels, 'subjects' => $subjects->count()];
        });
    }
}
