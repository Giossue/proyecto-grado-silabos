<?php

namespace App\Modules\Academic\Application\Actions;

use App\Models\User;
use App\Modules\Academic\Domain\AcademicStructurePermissions;
use App\Modules\Academic\Domain\CurriculumSystemFields;
use App\Modules\Academic\Infrastructure\Persistence\Models\CurriculumFieldDefinition;
use App\Modules\Academic\Infrastructure\Persistence\Models\CurriculumVersion;
use App\Modules\Academic\Infrastructure\Persistence\Models\Subject;
use App\Modules\Academic\Infrastructure\Persistence\Models\SubjectRequirement;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
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
    ) {}

    /** @param array{code: string, cycle_count: int|string} $data */
    public function updateConfiguration(
        string $curriculumId,
        array $data,
        User $actor,
        Request $request,
    ): CurriculumVersion {
        return DB::transaction(function () use ($actor, $curriculumId, $data, $request): CurriculumVersion {
            [$role, $curriculum] = $this->currentCurriculum($curriculumId, $request);
            $cycleCount = (int) $data['cycle_count'];

            $lastUsedCycle = (int) $curriculum->subjects()->max('ciclo');
            if ($lastUsedCycle > $cycleCount) {
                throw ValidationException::withMessages([
                    'cycle_count' => "Existen materias en el ciclo {$lastUsedCycle}. Muévalas antes de reducir la malla.",
                ]);
            }

            $beforeCode = $curriculum->codigo;
            $beforeCycleCount = $curriculum->numero_ciclos;
            $curriculum->update([
                'codigo' => $data['code'],
                'numero_ciclos' => $cycleCount,
            ]);
            $this->record($actor, $role, $request, 'academico.malla.configuracion_actualizada', 'malla', $curriculum->id, [
                'before_code' => $beforeCode,
                'after_code' => $curriculum->codigo,
                'before_cycle_count' => $beforeCycleCount,
                'after_cycle_count' => $cycleCount,
            ]);

            return $curriculum;
        });
    }

    /** @param array<string, mixed> $data */
    public function createField(string $curriculumId, array $data, User $actor, Request $request): CurriculumFieldDefinition
    {
        return DB::transaction(function () use ($actor, $curriculumId, $data, $request): CurriculumFieldDefinition {
            [$role, $curriculum] = $this->currentCurriculum($curriculumId, $request);
            if (($data['system_key'] ?? null) !== null
                && ! in_array($data['type'], ['numero', 'entero'], true)) {
                throw ValidationException::withMessages([
                    'type' => 'Los datos académicos estructurados de esta malla son numéricos.',
                ]);
            }
            if ($data['totalizable'] && ! in_array($data['type'], ['numero', 'entero'], true)) {
                throw ValidationException::withMessages([
                    'totalizable' => 'Solo los campos numéricos pueden incluirse en los totales.',
                ]);
            }
            if (($data['system_key'] ?? null) !== null
                && ! array_key_exists((string) $data['system_key'], CurriculumSystemFields::ATTRIBUTES)) {
                throw ValidationException::withMessages(['system_key' => 'El dato estructurado no es válido.']);
            }
            $field = CurriculumFieldDefinition::query()->firstOrNew([
                'version_malla_id' => $curriculum->id,
                'clave' => $data['key'],
            ]);
            $sameSystemField = CurriculumFieldDefinition::query()
                ->where('version_malla_id', $curriculum->id)
                ->where('clave_sistema', $data['system_key'] ?? null);
            if ($field->exists) {
                $sameSystemField->whereKeyNot($field->id);
            }
            if (($data['system_key'] ?? null) !== null && $sameSystemField->exists()) {
                throw ValidationException::withMessages([
                    'system_key' => 'Ese dato estructurado ya pertenece a otro campo de esta malla.',
                ]);
            }
            $field->fill([
                'etiqueta' => $data['label'],
                'tipo' => $data['type'],
                'clave_sistema' => $data['system_key'] ?? null,
                'posicion' => $data['position'],
                'visible_en_tarjeta' => $data['visible_on_card'],
                'totalizable' => $data['totalizable'],
                'activo' => true,
            ]);
            $field->save();
            $this->record($actor, $role, $request, 'academico.campo_malla.creacion', 'campo_malla', $field->id, [
                'curriculum_id' => $curriculum->id,
                'key' => $field->clave,
            ]);

            return $field;
        });
    }

    public function deleteField(
        string $curriculumId,
        string $fieldId,
        User $actor,
        Request $request,
    ): void {
        DB::transaction(function () use ($actor, $curriculumId, $fieldId, $request): void {
            [$role, $curriculum] = $this->currentCurriculum($curriculumId, $request);
            $field = CurriculumFieldDefinition::query()
                ->where('version_malla_id', $curriculum->id)
                ->lockForUpdate()
                ->findOrFail($fieldId);
            $metadata = ['curriculum_id' => $curriculum->id, 'key' => $field->clave];
            $field->update(['activo' => false]);
            $this->record($actor, $role, $request, 'academico.campo_malla.eliminacion', 'campo_malla', $fieldId, $metadata);
        });
    }

    /** @param array<string, mixed> $data */
    public function createRequirement(string $curriculumId, array $data, User $actor, Request $request): SubjectRequirement
    {
        return DB::transaction(function () use ($actor, $curriculumId, $data, $request): SubjectRequirement {
            [$role, $curriculum] = $this->currentCurriculum($curriculumId, $request);
            $subjects = Subject::query()
                ->where('version_malla_id', $curriculum->id)
                ->whereIn('id', [$data['subject_id'], $data['requirement_id']])
                ->lockForUpdate()
                ->get();

            if ($subjects->count() !== 2) {
                throw ValidationException::withMessages([
                    'requirement_id' => 'Ambas materias deben pertenecer a la malla actual.',
                ]);
            }

            if ($data['type'] === 'prerrequisito' && $this->createsCycle($curriculum->id, $data['subject_id'], $data['requirement_id'])) {
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
                'curriculum_id' => $curriculum->id,
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
            [$role, $curriculum] = $this->currentCurriculum($curriculumId, $request);
            $requirement = SubjectRequirement::query()
                ->whereHas('subject', fn ($query) => $query->where('version_malla_id', $curriculum->id))
                ->whereHas('requirement', fn ($query) => $query->where('version_malla_id', $curriculum->id))
                ->lockForUpdate()
                ->findOrFail($requirementId);
            $metadata = ['curriculum_id' => $curriculum->id, 'type' => $requirement->tipo];
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
            [$role, $curriculum] = $this->currentCurriculum($curriculumId, $request);
            $subject = Subject::query()
                ->where('version_malla_id', $curriculum->id)
                ->lockForUpdate()
                ->findOrFail($subjectId);

            // Decir «tiene ofertas o sílabos» deja a quien lo lee sin saber qué mirar ni
            // dónde: se nombra lo que hay y cuánto, que es lo que permite ir a revisarlo.
            $offerings = $subject->offerings()->count();
            $syllabi = Syllabus::query()->where('asignatura_id', $subject->id)->count();
            if ($offerings > 0 || $syllabi > 0) {
                $blockers = [];
                if ($offerings > 0) {
                    $blockers[] = $offerings === 1
                        ? '1 oferta académica'
                        : "{$offerings} ofertas académicas";
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
                'curriculum_id' => $curriculum->id,
                'code' => $subject->codigo_institucional,
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
            [$role, $curriculum] = $this->currentCurriculum($curriculumId, $request);
            if ((int) $data['cycle'] > $curriculum->numero_ciclos) {
                throw ValidationException::withMessages(['cycle' => 'El ciclo excede la configuración de la malla.']);
            }

            $subject = Subject::query()
                ->where('version_malla_id', $curriculum->id)
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

    /** @return array{RoleAssignment, CurriculumVersion} */
    private function currentCurriculum(string $curriculumId, Request $request): array
    {
        $role = $this->roles->resolve($request);
        if (! $role instanceof RoleAssignment
            || ! AcademicStructurePermissions::isCareerContext($role)
            || $role->carrera_id === null) {
            throw new AuthorizationException('Solo la coordinación vigente puede modificar la malla.');
        }
        // Con una convocatoria en curso los sílabos se apoyan en la malla: se pausa antes.
        $this->locks->assertCareerEditable($role->carrera_id);

        $curriculum = CurriculumVersion::query()
            ->where('carrera_id', $role->carrera_id)
            ->current()
            ->lockForUpdate()
            ->findOrFail($curriculumId);

        return [$role, $curriculum];
    }

    private function createsCycle(string $curriculumId, string $subjectId, string $requirementId): bool
    {
        $relations = SubjectRequirement::query()
            ->where('tipo', 'prerrequisito')
            ->whereHas('subject', fn ($query) => $query->where('version_malla_id', $curriculumId))
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
