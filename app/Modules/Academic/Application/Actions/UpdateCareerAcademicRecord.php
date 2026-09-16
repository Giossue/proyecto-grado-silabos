<?php

namespace App\Modules\Academic\Application\Actions;

use App\Models\User;
use App\Modules\Academic\Application\AcademicPeriodPlanning;
use App\Modules\Academic\Application\ScheduledSubjectInheritance;
use App\Modules\Academic\Domain\AcademicStructurePermissions;
use App\Modules\Academic\Domain\CurriculumSystemFields;
use App\Modules\Academic\Infrastructure\Persistence\Models\AcademicPeriod;
use App\Modules\Academic\Infrastructure\Persistence\Models\Campus;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\Parallel;
use App\Modules\Academic\Infrastructure\Persistence\Models\ScheduledSubject;
use App\Modules\Academic\Infrastructure\Persistence\Models\Subject;
use App\Modules\Academic\Infrastructure\Persistence\Models\TeacherAssignment;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\InProgressWork;
use App\Modules\Syllabus\Application\ProcessLocks;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusCollaborator;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusScope;
use DateTimeInterface;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class UpdateCareerAcademicRecord
{
    /** @var array<string, string> */
    private const FIELD_LABELS = [
        'codigo' => 'Código de malla',
        'codigo_asignatura' => 'Código de asignatura',
        'codigo_paralelo' => 'Código de paralelo',
        'nombre' => 'Nombre',
        'ciclo' => 'Ciclo',
        'orden_en_ciclo' => 'Orden dentro del ciclo',
        'unidad_organizacion_curricular' => 'Unidad de organización curricular',
        'creditos' => 'Créditos',
        'horas_totales' => 'Horas totales',
        'horas_proyecto' => 'Horas de proyecto',
        'horas_ap' => 'Horas AP',
        'horas_ac' => 'Horas AC',
        'horas_pae' => 'Horas PAE',
        'horas_aa' => 'Horas AA',
        'horas_paec' => 'Horas PAEC',
        'periodo_academico_id' => 'Periodo académico',
        'asignatura_id' => 'Materia',
        'campus_id' => 'Campus',
        'modalidad' => 'Modalidad',
        'programacion_asignatura_id' => 'Programación de asignatura',
        'usuario_id' => 'Docente',
        'paralelo_id' => 'Paralelo',
    ];

    /** @var array<string, string> */
    private const AUDIT_KEYS = [
        'codigo' => 'code',
        'codigo_asignatura' => 'code',
        'codigo_paralelo' => 'code',
        'nombre' => 'name',
        'ciclo' => 'cycle',
        'orden_en_ciclo' => 'position',
        'unidad_organizacion_curricular' => 'organization_unit',
        'modalidad' => 'modality',
        'creditos' => 'credits',
        'horas_totales' => 'total_hours',
    ];

    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly ProcessLocks $locks,
        private readonly InProgressWork $work,
        private readonly ScheduledSubjectInheritance $inheritance,
        private readonly AcademicPeriodPlanning $periodPlanning,
    ) {}

    /** @param array<string, mixed> $data */
    public function execute(
        string $entity,
        string $recordId,
        array $data,
        User $actor,
        Request $request,
    ): Model {
        $activeRole = $this->roles->resolve($request);

        if (! $activeRole instanceof RoleAssignment
            || ! AcademicStructurePermissions::mayUpdate($activeRole, $entity)
            || $activeRole->carrera_id === null) {
            throw new AuthorizationException('No puede editar este registro con el rol activo.');
        }
        // Toda la estructura de carrera queda congelada mientras sus docentes trabajan.
        // Un relevo no pasa por esta edición genérica: conserva el sílabo y su auditoría.
        $this->locks->assertCareerEditable($activeRole->carrera_id);
        if ($entity === 'asignatura') {
            // Lo que el sílabo copia de la malla cambia: el trabajo en curso se borra, con confirmación.
            $this->work->requireConfirmation($request, $activeRole->carrera_id);
        }

        return DB::transaction(function () use ($actor, $activeRole, $data, $entity, $recordId, $request): Model {
            $record = $this->scopedRecord($entity, $recordId, $activeRole->carrera_id);
            $this->assertPeriodMayChange($record);
            $this->ensureMutable($entity, $record);
            if ($record instanceof Subject && isset($data['cycle'])) {
                $cycleCount = Career::query()
                    ->whereKey($record->carrera_id)
                    ->lockForUpdate()
                    ->value('cantidad_ciclos_malla');
                if ((int) $data['cycle'] > (int) $cycleCount) {
                    throw ValidationException::withMessages([
                        'cycle' => 'El ciclo excede la configuración de esta malla.',
                    ]);
                }
            }
            $attributes = $this->attributes($entity, $data, $activeRole->carrera_id, $record);
            $record->fill($attributes);
            $dirty = $record->getDirty();
            if ($dirty === []) {
                return $record;
            }

            $metadata = $this->auditContext($record, $dirty);
            $record->save();

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole->id,
                action: "academico.{$entity}.actualizacion",
                resourceType: $entity,
                resourceId: (string) $record->getKey(),
                result: 'exito',
                metadata: $metadata,
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $record;
        });
    }

    private function scopedRecord(string $entity, string $recordId, string $careerId): Model
    {
        return match ($entity) {
            'asignatura' => Subject::query()
                ->whereKey($recordId)
                ->where('carrera_id', $careerId)
                ->lockForUpdate()->firstOrFail(),
            'programacion_asignatura' => ScheduledSubject::query()
                ->whereKey($recordId)
                ->whereHas('subject', fn ($query) => $query->where('carrera_id', $careerId))
                ->lockForUpdate()->firstOrFail(),
            'paralelo' => Parallel::query()
                ->whereKey($recordId)
                ->whereHas('scheduledSubject.subject', fn ($query) => $query->where('carrera_id', $careerId))
                ->lockForUpdate()->firstOrFail(),
            'asignacion_docente' => TeacherAssignment::query()
                ->whereKey($recordId)
                ->whereHas('parallel.scheduledSubject.subject', fn ($query) => $query->where('carrera_id', $careerId))
                ->lockForUpdate()->firstOrFail(),
            default => throw new AuthorizationException('El tipo de registro no admite edición desde Coordinación.'),
        };
    }

    private function ensureMutable(string $entity, Model $record): void
    {
        $usedBySyllabus = match ($entity) {
            'asignatura' => false,
            'programacion_asignatura' => SyllabusScope::query()->where('programacion_asignatura_id', $record->getKey())->exists(),
            'paralelo' => SyllabusScope::query()->where('paralelo_id', $record->getKey())->exists(),
            'asignacion_docente' => SyllabusCollaborator::query()->where('docente_paralelo_id', $record->getKey())->exists(),
            default => true,
        };

        if ($usedBySyllabus) {
            throw ValidationException::withMessages([
                'record' => match ($entity) {
                    default => 'Este registro ya forma parte del historial de un sílabo. No puede modificarse ni eliminarse para conservar la trazabilidad.',
                },
            ]);
        }
    }

    /** @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function attributes(string $entity, array $data, string $careerId, Model $record): array
    {
        return match ($entity) {
            'asignatura' => $this->subjectAttributes($data, $record),
            'programacion_asignatura' => $this->scheduledSubjectAttributes($data, $careerId),
            'paralelo' => $this->parallelAttributes($data, $careerId),
            'asignacion_docente' => $this->teacherAssignmentAttributes($data, $careerId),
            default => throw ValidationException::withMessages(['entity' => 'El tipo de registro no admite edición.']),
        };
    }

    /** @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function subjectAttributes(array $data, Model $record): array
    {
        if (! $record instanceof Subject) {
            throw new \LogicException('El registro esperado debe ser una materia.');
        }

        $attributes = [
            'codigo_asignatura' => $data['code'],
            'nombre' => $data['nombre'],
            'ciclo' => $data['cycle'] ?? null,
            'modalidad' => $this->inheritance->subjectModality($data),
            'creditos' => $data['creditos'] ?? null,
            'horas_totales' => CurriculumSystemFields::totalHours($data),
        ];
        $optional = [
            'position' => 'orden_en_ciclo',
            'organization_unit' => 'unidad_organizacion_curricular',
            'hours_project' => 'horas_proyecto',
            'hours_ap' => 'horas_ap',
            'horas_ac' => 'horas_ac',
            'horas_pae' => 'horas_pae',
            'horas_aa' => 'horas_aa',
            'hours_paec' => 'horas_paec',
        ];

        foreach ($optional as $input => $attribute) {
            if (array_key_exists($input, $data)) {
                $attributes[$attribute] = $data[$input];
            }
        }

        return $attributes;
    }

    /** @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function scheduledSubjectAttributes(array $data, string $careerId): array
    {
        $subject = Subject::query()->whereKey($this->stringValue($data, 'subject_id'))
            ->where('activo', true)
            ->where('carrera_id', $careerId)
            ->lockForUpdate()->firstOrFail();
        $period = AcademicPeriod::query()->whereKey($this->stringValue($data, 'period_id'))
            ->lockForUpdate()->firstOrFail();
        $this->periodPlanning->assertMayPlan($period);
        $subject->loadMissing('career');

        return [
            'periodo_academico_id' => $period->id,
            'asignatura_id' => $subject->id,
            // Heredados: el campus lo fija la carrera; la modalidad, la carrera o la materia.
            'campus_id' => $this->inheritance->campusFor($subject->career)->id,
            'modalidad' => $this->inheritance->modalityFor($subject),
        ];
    }

    /** @param array<string, mixed> $data
     * @return array<string, string>
     */
    private function parallelAttributes(array $data, string $careerId): array
    {
        $scheduledSubject = ScheduledSubject::query()->whereKey($this->stringValue($data, 'scheduled_subject_id'))
            ->where('activo', true)
            ->whereHas('subject', fn ($query) => $query->where('carrera_id', $careerId))
            ->lockForUpdate()->firstOrFail();
        $this->periodPlanning->assertScheduledSubjectMayChange($scheduledSubject, 'scheduled_subject_id');

        return ['programacion_asignatura_id' => $scheduledSubject->id, 'codigo' => $data['code'], 'jornada' => $data['shift'] ?? null];
    }

    /** @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function teacherAssignmentAttributes(array $data, string $careerId): array
    {
        $parallel = Parallel::query()->whereKey($this->stringValue($data, 'parallel_id'))
            ->where('activo', true)
            ->whereHas('scheduledSubject.subject', fn ($query) => $query->where('carrera_id', $careerId))
            ->lockForUpdate()->firstOrFail();
        $this->periodPlanning->assertParallelMayChange($parallel, 'parallel_id');
        $userId = $this->stringValue($data, 'user_id');
        $roleAssignment = RoleAssignment::query()->effective()
            ->where('usuario_id', $userId)
            ->where('carrera_id', $careerId)
            ->where('rol', RoleCode::Teacher->value)
            ->whereHas('user', fn ($query) => $query->where('activo', true))
            ->first();

        if (! $roleAssignment instanceof RoleAssignment) {
            throw ValidationException::withMessages([
                'user_id' => 'La persona no tiene un rol Docente vigente en esta carrera.',
            ]);
        }

        return [
            'asignacion_rol_id' => $roleAssignment->id,
            'paralelo_id' => $parallel->id,
        ];
    }

    private function assertPeriodMayChange(Model $record): void
    {
        if ($record instanceof ScheduledSubject) {
            $this->periodPlanning->assertScheduledSubjectMayChange($record);
        }

        if ($record instanceof Parallel) {
            $this->periodPlanning->assertParallelMayChange($record);
        }

        if ($record instanceof TeacherAssignment) {
            $this->periodPlanning->assertTeacherAssignmentMayChange($record);
        }
    }

    /** @param array<string, mixed> $dirty
     * @return array<string, bool|float|int|string|null>
     */
    private function auditContext(Model $record, array $dirty): array
    {
        $metadata = [
            'changed_fields' => implode(', ', array_map(
                fn (string $field): string => self::FIELD_LABELS[$field] ?? $field,
                array_keys($dirty),
            )),
        ];

        foreach (array_keys($dirty) as $field) {
            $auditKey = self::AUDIT_KEYS[$field] ?? $field;
            $metadata["before_{$auditKey}"] = $this->scalarValue($record->getRawOriginal($field));
            $metadata["after_{$auditKey}"] = $this->scalarValue($record->getAttribute($field));
        }

        return $metadata;
    }

    private function scalarValue(mixed $value): bool|float|int|string|null
    {
        if ($value instanceof DateTimeInterface) {
            return $value->format('Y-m-d');
        }

        return is_bool($value) || is_float($value) || is_int($value) || is_string($value)
            ? $value
            : null;
    }

    /** @param array<string, mixed> $data */
    private function stringValue(array $data, string $key): string
    {
        $value = $data[$key] ?? null;

        if (! is_string($value)) {
            throw ValidationException::withMessages([$key => 'El identificador recibido no es válido.']);
        }

        return $value;
    }
}
