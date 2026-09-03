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
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Prepara un periodo con un clic: toda materia activa de la malla activa queda con su
 * oferta (campus y modalidad heredados de la carrera) y con un paralelo «A». Lo que ya
 * existía se respeta, así que repetirlo no duplica nada; lo que no se dicte se archiva
 * después. Es el estándar de los sistemas académicos: la oferta de un periodo es la
 * malla completa, y la excepción se quita, no se teclea (I-36).
 */
class PreparePeriod
{
    public const DEFAULT_PARALLEL = 'A';

    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly OfferingInheritance $inheritance,
    ) {}

    /**
     * @param  array{period_id: string}  $data
     * @return array{offerings: int, parallels: int, subjects: int}
     */
    public function execute(array $data, User $actor, Request $request): array
    {
        $activeRole = $this->roles->resolve($request);
        if (! $activeRole instanceof RoleAssignment || $activeRole->carrera_id === null) {
            throw new AuthorizationException('No puede preparar periodos con el rol activo.');
        }
        $careerId = $activeRole->carrera_id;

        return DB::transaction(function () use ($actor, $activeRole, $careerId, $data, $request): array {
            $career = Career::query()->whereKey($careerId)->with(['campus', 'modality'])->lockForUpdate()->firstOrFail();
            $period = AcademicPeriod::query()->whereKey($data['period_id'])->lockForUpdate()->firstOrFail();
            $campus = $this->inheritance->campusFor($career);
            $subjects = Subject::query()
                ->where('activo', true)
                ->whereHas('curriculum', fn ($query) => $query->where('carrera_id', $careerId)->where('estado', 'activa'))
                ->with(['curriculum.career.modality', 'modality'])
                ->orderBy('ciclo')
                ->orderBy('orden_en_ciclo')
                ->get();
            if ($subjects->isEmpty()) {
                throw ValidationException::withMessages([
                    'period_id' => 'La carrera no tiene malla activa con materias. Ármela antes de preparar el periodo.',
                ]);
            }

            $existing = CourseOffering::query()
                ->where('periodo_academico_id', $period->id)
                ->whereIn('asignatura_id', $subjects->pluck('id'))
                ->withCount('parallels')
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
                        'modalidad_id' => $this->inheritance->modalityFor($subject)->id,
                        'activo' => true,
                    ]);
                    $offering->parallels_count = 0;
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
                if ((int) $offering->parallels_count === 0) {
                    $parallel = Parallel::query()->create([
                        'oferta_academica_id' => $offering->id,
                        'codigo' => self::DEFAULT_PARALLEL,
                        'activo' => true,
                    ]);
                    $this->audit->execute(
                        actorId: $actor->id,
                        roleAssignmentId: $activeRole->id,
                        action: 'academico.paralelo.creacion',
                        resourceType: 'paralelo',
                        resourceId: $parallel->id,
                        result: 'exito',
                        metadata: ['period_prepared' => true],
                        correlationId: $correlationId,
                    );
                    $parallels++;
                }
            }

            return ['offerings' => $offerings, 'parallels' => $parallels, 'subjects' => $subjects->count()];
        });
    }
}
