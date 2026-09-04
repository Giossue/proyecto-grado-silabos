<?php

namespace App\Modules\Academic\Application\Actions;

use App\Models\User;
use App\Modules\Academic\Application\OfferingInheritance;
use App\Modules\Academic\Infrastructure\Persistence\Models\AcademicPeriod;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\CourseOffering;
use App\Modules\Academic\Infrastructure\Persistence\Models\Parallel;
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
 * Prepara las materias seleccionadas de un período: cada una recibe su oferta (campus y
 * modalidad heredados) y los paralelos indicados. Lo existente se respeta y solo se
 * agregan códigos faltantes: omitir una materia nunca la elimina por sorpresa.
 */
class PreparePeriod
{
    public const DEFAULT_PARALLEL = 'A';

    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly OfferingInheritance $inheritance,
        private readonly ProcessLocks $locks,
    ) {}

    /**
     * @param  array{period_id: string, subjects?: list<array{id: string, codes: list<string>, shift?: string|null}>}  $data
     * @return array{offerings: int, parallels: int, subjects: int}
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
            $campus = $this->inheritance->campusFor($career);
            $settingsBySubject = collect($data['subjects'] ?? [])->keyBy('id');
            $subjectsQuery = Subject::query()
                ->where('activo', true)
                ->whereHas('curriculum', fn ($query) => $query->where('carrera_id', $careerId)->where('estado', 'activa'))
                ->with('curriculum.career')
                ->orderBy('ciclo')
                ->orderBy('orden_en_ciclo');
            if ($settingsBySubject->isNotEmpty()) {
                $subjectsQuery->whereIn('id', $settingsBySubject->keys());
            }
            $subjects = $subjectsQuery->get();
            if ($subjects->isEmpty()) {
                throw ValidationException::withMessages([
                    'period_id' => 'No hay materias activas seleccionadas en la malla de esta carrera.',
                ]);
            }
            if ($settingsBySubject->isNotEmpty() && $subjects->count() !== $settingsBySubject->count()) {
                throw ValidationException::withMessages([
                    'subjects' => 'Todas las materias seleccionadas deben estar activas y pertenecer a la malla de esta carrera.',
                ]);
            }

            $existing = CourseOffering::query()
                ->where('periodo_academico_id', $period->id)
                ->whereIn('asignatura_id', $subjects->pluck('id'))
                ->get()
                ->keyBy('asignatura_id');
            $correlationId = $request->attributes->getString('correlation_id') ?: null;
            $offerings = 0;
            $parallels = 0;

            foreach ($subjects as $subject) {
                $offering = $existing->get($subject->id);
                if ($offering === null) {
                    $offering = CourseOffering::query()->create([
                        'periodo_academico_id' => $period->id,
                        'asignatura_id' => $subject->id,
                        'campus_id' => $campus->id,
                        'modalidad' => $this->inheritance->modalityFor($subject),
                        'activo' => true,
                    ]);
                    $this->audit->execute(
                        actorId: $actor->id,
                        roleAssignmentId: $activeRole->id,
                        action: 'academico.oferta.creacion',
                        resourceType: 'oferta',
                        resourceId: $offering->id,
                        result: 'exito',
                        metadata: ['period_prepared' => true],
                        correlationId: $correlationId,
                    );
                    $offerings++;
                }
                /** @var array{codes: list<string>, shift?: string|null}|null $setting */
                $setting = $settingsBySubject->get($subject->id);
                $codes = $setting['codes'] ?? [self::DEFAULT_PARALLEL];
                $existingCodes = Parallel::query()
                    ->where('oferta_academica_id', $offering->id)
                    ->whereIn('codigo', $codes)
                    ->pluck('codigo')
                    ->all();

                foreach (array_diff($codes, $existingCodes) as $code) {
                    $parallel = Parallel::query()->create([
                        'oferta_academica_id' => $offering->id,
                        'codigo' => $code,
                        'jornada' => $setting['shift'] ?? null,
                        'activo' => true,
                    ]);
                    $this->audit->execute(
                        actorId: $actor->id,
                        roleAssignmentId: $activeRole->id,
                        action: 'academico.paralelo.creacion',
                        resourceType: 'paralelo',
                        resourceId: $parallel->id,
                        result: 'exito',
                        metadata: ['period_prepared' => true, 'bulk' => $setting !== null],
                        correlationId: $correlationId,
                    );
                    $parallels++;
                }
            }

            return ['offerings' => $offerings, 'parallels' => $parallels, 'subjects' => $subjects->count()];
        });
    }
}
