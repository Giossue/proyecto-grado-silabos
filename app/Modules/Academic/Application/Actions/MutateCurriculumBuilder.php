<?php

namespace App\Modules\Academic\Application\Actions;

use App\Models\User;
use App\Modules\Academic\Domain\AcademicStructurePermissions;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\Subject;
use App\Modules\Academic\Infrastructure\Persistence\Models\SubjectRequirement;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\InProgressWork;
use App\Modules\Syllabus\Application\ProcessLocks;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class MutateCurriculumBuilder
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly ProcessLocks $locks,
        private readonly InProgressWork $work,
    ) {}

    /** @param array{code: string, cycle_count: int|string} $data */
    public function updateConfiguration(
        string $curriculumId,
        array $data,
        User $actor,
        Request $request,
    ): Career {
        return DB::transaction(function () use ($actor, $curriculumId, $data, $request): Career {
            [$role, $career] = $this->currentCareer($curriculumId, $request);
            $this->work->requireConfirmation($request, $role->carrera_id);
            $cycleCount = (int) $data['cycle_count'];

            $lastUsedCycle = (int) $career->subjects()->max('ciclo');
            if ($lastUsedCycle > $cycleCount) {
                throw ValidationException::withMessages([
                    'cycle_count' => "Existen materias en el ciclo {$lastUsedCycle}. Muévalas antes de reducir la malla.",
                ]);
            }

            $beforeCode = $career->codigo_malla;
            $beforeCycleCount = $career->cantidad_ciclos_malla;
            $career->update([
                'codigo_malla' => $data['code'],
                'cantidad_ciclos_malla' => $cycleCount,
            ]);
            $this->record($actor, $role, $request, 'academico.carrera.plan_curricular_actualizado', 'carrera', $career->id, [
                'before_code' => $beforeCode,
                'after_code' => $career->codigo_malla,
                'before_cycle_count' => $beforeCycleCount,
                'after_cycle_count' => $cycleCount,
            ]);

            return $career;
        });
    }

    /** @param array<string, mixed> $data */
    public function createRequirement(string $curriculumId, array $data, User $actor, Request $request): SubjectRequirement
    {
        return DB::transaction(function () use ($actor, $curriculumId, $data, $request): SubjectRequirement {
            [$role, $career] = $this->currentCareer($curriculumId, $request);
            $subjects = Subject::query()
                ->where('carrera_id', $career->id)
                ->whereIn('id', [$data['subject_id'], $data['requirement_id']])
                ->lockForUpdate()
                ->get();

            if ($subjects->count() !== 2) {
                throw ValidationException::withMessages([
                    'requirement_id' => 'Ambas materias deben pertenecer a la malla actual.',
                ]);
            }

            if ($data['type'] === 'prerrequisito' && $this->createsCycle($career->id, $data['subject_id'], $data['requirement_id'])) {
                throw ValidationException::withMessages([
                    'requirement_id' => 'La relación produciría un ciclo de prerrequisitos.',
                ]);
            }

            $requirement = SubjectRequirement::query()->firstOrCreate([
                'asignatura_id' => $data['subject_id'],
                'requisito_id' => $data['requirement_id'],
                'tipo' => $data['type'],
            ]);
            if (! $requirement->wasRecentlyCreated) {
                return $requirement;
            }
            $this->record($actor, $role, $request, 'academico.requisito_asignatura.creacion', 'requisito_asignatura', $requirement->id, [
                'career_id' => $career->id,
                'subject_id' => $requirement->asignatura_id,
                'requirement_id' => $requirement->requisito_id,
                'type' => $requirement->tipo,
            ]);

            return $requirement;
        });
    }

    public function deleteRequirement(
        string $curriculumId,
        string $requirementId,
        User $actor,
        Request $request,
    ): void {
        DB::transaction(function () use ($actor, $curriculumId, $requirementId, $request): void {
            [$role, $career] = $this->currentCareer($curriculumId, $request);
            $requirement = SubjectRequirement::query()
                ->whereHas('subject', fn ($query) => $query->where('carrera_id', $career->id))
                ->whereHas('requirement', fn ($query) => $query->where('carrera_id', $career->id))
                ->lockForUpdate()
                ->findOrFail($requirementId);
            $metadata = ['career_id' => $career->id, 'type' => $requirement->tipo];
            $requirement->delete();
            $this->record($actor, $role, $request, 'academico.requisito_asignatura.eliminacion', 'requisito_asignatura', $requirementId, $metadata);
        });
    }

    public function deleteSubject(
        string $curriculumId,
        string $subjectId,
        User $actor,
        Request $request,
    ): void {
        DB::transaction(function () use ($actor, $curriculumId, $subjectId, $request): void {
            [$role, $career] = $this->currentCareer($curriculumId, $request);
            $this->work->requireConfirmation($request, $role->carrera_id);
            $subject = Subject::query()
                ->where('carrera_id', $career->id)
                ->lockForUpdate()
                ->findOrFail($subjectId);

            // Indicar cada dependencia permite entender por qué se protege la materia.
            // dónde: se nombra lo que hay y cuánto, que es lo que permite ir a revisarlo.
            $scheduledSubjects = $subject->scheduledSubjects()->count();
            $syllabi = Syllabus::query()->where('asignatura_id', $subject->id)->count();
            if ($scheduledSubjects > 0 || $syllabi > 0) {
                $blockers = [];
                if ($scheduledSubjects > 0) {
                    $blockers[] = $scheduledSubjects === 1
                        ? '1 programación de asignatura'
                        : "{$scheduledSubjects} programaciones de asignatura";
                }
                if ($syllabi > 0) {
                    $blockers[] = $syllabi === 1 ? '1 sílabo' : "{$syllabi} sílabos";
                }

                throw ValidationException::withMessages([
                    'subject' => 'No se puede eliminar «'.$subject->nombre.'»: tiene '
                        .implode(' y ', $blockers)
                        .'. Estos son registros de otros procesos, no las relaciones de la malla.'
                        .' Archívela para conservar el historial.',
                ]);
            }

            SubjectRequirement::query()
                ->where('asignatura_id', $subject->id)
                ->orWhere('requisito_id', $subject->id)
                ->delete();
            $metadata = [
                'career_id' => $career->id,
                'code' => $subject->codigo_asignatura,
                'name' => $subject->nombre,
            ];
            $subject->delete();
            $this->record($actor, $role, $request, 'academico.asignatura.eliminacion', 'asignatura', $subjectId, $metadata);
        });
    }

    /** @param array<string, mixed> $data */
    public function updateSubjectLayout(string $curriculumId, array $data, User $actor, Request $request): Subject
    {
        return DB::transaction(function () use ($actor, $curriculumId, $data, $request): Subject {
            [$role, $career] = $this->currentCareer($curriculumId, $request);
            if ((int) $data['cycle'] > $career->cantidad_ciclos_malla) {
                throw ValidationException::withMessages(['cycle' => 'El ciclo excede la configuración de la malla.']);
            }

            $subject = Subject::query()
                ->where('carrera_id', $career->id)
                ->whereKey($data['subject_id'])
                ->lockForUpdate()
                ->firstOrFail();
            $beforeCycle = $subject->ciclo;
            $beforePosition = $subject->orden_en_ciclo;
            $subject->update([
                'ciclo' => $data['cycle'],
                'orden_en_ciclo' => $data['position'],
            ]);
            $this->record($actor, $role, $request, 'academico.asignatura.posicion_actualizada', 'asignatura', $subject->id, [
                'before_cycle' => $beforeCycle,
                'after_cycle' => $subject->ciclo,
                'before_position' => $beforePosition,
                'after_position' => $subject->orden_en_ciclo,
            ]);

            return $subject;
        });
    }

    /** @return array{RoleAssignment, Career} */
    private function currentCareer(string $curriculumId, Request $request): array
    {
        $role = $this->roles->resolve($request);
        if (! $role instanceof RoleAssignment
            || ! AcademicStructurePermissions::isCareerContext($role)
            || $role->carrera_id === null) {
            throw new AuthorizationException('Solo la coordinación activa puede modificar la malla.');
        }
        // Con una convocatoria en curso los sílabos se apoyan en la malla: se pausa antes.
        $this->locks->assertCareerEditable($role->carrera_id);

        $career = Career::query()->whereKey($role->carrera_id)->lockForUpdate()->findOrFail($curriculumId);

        return [$role, $career];
    }

    private function createsCycle(string $careerId, string $subjectId, string $requirementId): bool
    {
        $relations = SubjectRequirement::query()
            ->where('tipo', 'prerrequisito')
            ->whereHas('subject', fn ($query) => $query->where('carrera_id', $careerId))
            ->get(['asignatura_id', 'requisito_id'])
            ->groupBy('asignatura_id');
        $pending = [$requirementId];
        $visited = [];

        while ($pending !== []) {
            $current = array_pop($pending);
            if ($current === $subjectId) {
                return true;
            }
            if (isset($visited[$current])) {
                continue;
            }

            $visited[$current] = true;
            foreach ($relations->get($current, collect()) as $relation) {
                $pending[] = $relation->requisito_id;
            }
        }

        return false;
    }

    /** @param array<string, bool|float|int|string|null> $metadata */
    private function record(
        User $actor,
        RoleAssignment $role,
        Request $request,
        string $action,
        string $resourceType,
        string $resourceId,
        array $metadata,
    ): void {
        $this->audit->execute(
            actorId: $actor->id,
            roleAssignmentId: $role->id,
            action: $action,
            resourceType: $resourceType,
            resourceId: $resourceId,
            result: 'exito',
            metadata: $metadata,
            correlationId: $request->attributes->getString('correlation_id') ?: null,
        );
    }
}
