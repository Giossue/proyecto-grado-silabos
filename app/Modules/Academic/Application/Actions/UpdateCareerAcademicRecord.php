<?php

namespace App\Modules\Academic\Application\Actions;

use App\Models\User;
use App\Modules\Academic\Application\OfferingInheritance;
use App\Modules\Academic\Domain\AcademicStructurePermissions;
use App\Modules\Academic\Domain\CurriculumSystemFields;
use App\Modules\Academic\Infrastructure\Persistence\Models\AcademicPeriod;
use App\Modules\Academic\Infrastructure\Persistence\Models\Campus;
use App\Modules\Academic\Infrastructure\Persistence\Models\CourseOffering;
use App\Modules\Academic\Infrastructure\Persistence\Models\Curriculum;
use App\Modules\Academic\Infrastructure\Persistence\Models\CurriculumFieldDefinition;
use App\Modules\Academic\Infrastructure\Persistence\Models\Parallel;
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
        'codigo' => 'Código',
        'codigo_institucional' => 'Código',
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
        'oferta_academica_id' => 'Oferta académica',
        'usuario_id' => 'Docente',
        'paralelo_id' => 'Paralelo',
        'vigente_desde' => 'Vigente desde',
        'vigente_hasta' => 'Vigente hasta',
    ];

    /** @var array<string, string> */
    private const AUDIT_KEYS = [
        'codigo' => 'code',
        'codigo_institucional' => 'code',
        'nombre' => 'name',
        'ciclo' => 'cycle',
        'orden_en_ciclo' => 'position',
        'unidad_organizacion_curricular' => 'organization_unit',
        'modalidad' => 'modality',
        'creditos' => 'credits',
        'horas_totales' => 'total_hours',
        'vigente_desde' => 'valid_from',
        'vigente_hasta' => 'valid_until',
    ];

    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly ProcessLocks $locks,
        private readonly InProgressWork $work,
        private readonly SyncSubjectFieldValues $syncSubjectFieldValues,
        private readonly OfferingInheritance $inheritance,
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
        // Malla y materias se congelan mientras una convocatoria de la carrera está en
        // curso; ofertas, paralelos y asignaciones siguen editables (relevo docente).
        if (in_array($entity, ['malla', 'asignatura'], true)) {
            $this->locks->assertCareerEditable($activeRole->carrera_id);
            // Lo que el sílabo copia de la malla cambia: el trabajo en curso se borra, con confirmación.
            $this->work->requireConfirmation($request, $activeRole->carrera_id);
        }

        return DB::transaction(function () use ($actor, $activeRole, $data, $entity, $recordId, $request): Model {
            $record = $this->scopedRecord($entity, $recordId, $activeRole->carrera_id);
            $this->ensureMutable($entity, $record);
            if ($record instanceof Subject && isset($data['cycle'])) {
                $cycleCount = Curriculum::query()
                    ->whereKey($record->malla_id)
                    ->lockForUpdate()
                    ->value('numero_ciclos');
                if ((int) $data['cycle'] > (int) $cycleCount) {
                    throw ValidationException::withMessages([
                        'cycle' => 'El ciclo excede la configuración de esta malla.',
                    ]);
                }
            }
            $attributes = $this->attributes($entity, $data, $activeRole->carrera_id, $record);
            $record->fill($attributes);
            $dirty = $record->getDirty();
            $customValuesChanged = false;
            if ($record instanceof Subject) {
                $customValues = $data['custom_values'] ?? [];
                $customValuesChanged = $this->syncSubjectFieldValues->execute(
                    $record,
                    is_array($customValues) ? $customValues : [],
                );
            }

            if ($dirty === [] && ! $customValuesChanged) {
                return $record;
            }

            $metadata = $this->auditContext($record, $dirty);
            if ($customValuesChanged) {
                $metadata['custom_fields_changed'] = true;
            }
            if ($dirty !== []) {
                $record->save();
            }

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
            'malla' => Curriculum::query()
                ->whereKey($recordId)->where('carrera_id', $careerId)->lockForUpdate()->firstOrFail(),
            'asignatura' => Subject::query()
                ->whereKey($recordId)
                ->whereHas('curriculum', fn ($query) => $query
                    ->where('carrera_id', $careerId))
                ->lockForUpdate()->firstOrFail(),
            'oferta' => CourseOffering::query()
                ->whereKey($recordId)
                ->whereHas('subject.curriculum', fn ($query) => $query
                    ->where('carrera_id', $careerId))
                ->lockForUpdate()->firstOrFail(),
            'paralelo' => Parallel::query()
                ->whereKey($recordId)
                ->whereHas('offering.subject.curriculum', fn ($query) => $query
                    ->where('carrera_id', $careerId))
                ->lockForUpdate()->firstOrFail(),
            'asignacion_docente' => TeacherAssignment::query()
                ->whereKey($recordId)
                ->whereHas('parallel.offering.subject.curriculum', fn ($query) => $query
                    ->where('carrera_id', $careerId))
                ->lockForUpdate()->firstOrFail(),
            default => throw new AuthorizationException('El tipo de registro no admite edición desde Coordinación.'),
        };
    }

    private function ensureMutable(string $entity, Model $record): void
    {
        $usedBySyllabus = match ($entity) {
            'malla', 'asignatura' => false,
            'oferta' => SyllabusScope::query()->where('oferta_academica_id', $record->getKey())->exists(),
            'paralelo' => SyllabusScope::query()->where('paralelo_id', $record->getKey())->exists(),
            'asignacion_docente' => SyllabusCollaborator::query()->where('asignacion_docente_id', $record->getKey())->exists(),
            default => true,
        };

        if ($usedBySyllabus) {
            throw ValidationException::withMessages([
                'record' => match ($entity) {
                    default => 'Este registro ya forma parte del historial de un sílabo. Archívelo y cree otro para conservar la trazabilidad.',
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
            'malla' => [
                'codigo' => $data['code'],
            ],
            'asignatura' => $this->subjectAttributes($data, $record),
            'oferta' => $this->offeringAttributes($data, $careerId),
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

        $activeSystemKeys = CurriculumFieldDefinition::query()
            ->where('malla_id', $record->malla_id)
            ->where('activo', true)
            ->whereNotNull('clave_sistema')
            ->pluck('clave_sistema');

        $attributes = [
            'codigo_institucional' => $data['code'],
            'nombre' => $data['nombre'],
            'ciclo' => $data['cycle'] ?? null,
            'modalidad' => $this->inheritance->subjectModality($data),
            'creditos' => $data['creditos'] ?? null,
            'horas_totales' => CurriculumSystemFields::totalHours($data, $activeSystemKeys),
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
    private function offeringAttributes(array $data, string $careerId): array
    {
        $subject = Subject::query()->whereKey($this->stringValue($data, 'subject_id'))
            ->where('activo', true)
            ->whereHas('curriculum', fn ($query) => $query
                ->where('carrera_id', $careerId)
                ->where('estado', 'activa'))
            ->lockForUpdate()->firstOrFail();
        $period = AcademicPeriod::query()->whereKey($this->stringValue($data, 'period_id'))
            ->where('activo', true)
            ->where(fn ($query) => $query->whereNull('carrera_id')->orWhere('carrera_id', $careerId))
            ->lockForUpdate()->firstOrFail();
        $subject->loadMissing('curriculum.career');

        return [
            'periodo_academico_id' => $period->id,
            'asignatura_id' => $subject->id,
            // Heredados: el campus lo fija la carrera; la modalidad, la carrera o la materia.
            'campus_id' => $this->inheritance->campusFor($subject->curriculum->career)->id,
            'modalidad' => $this->inheritance->modalityFor($subject),
        ];
    }

    /** @param array<string, mixed> $data
     * @return array<string, string>
     */
    private function parallelAttributes(array $data, string $careerId): array
    {
        $offering = CourseOffering::query()->whereKey($this->stringValue($data, 'offering_id'))
            ->where('activo', true)
            ->whereHas('subject.curriculum', fn ($query) => $query
                ->where('carrera_id', $careerId)
                ->where('estado', 'activa'))
            ->lockForUpdate()->firstOrFail();

        return ['oferta_academica_id' => $offering->id, 'codigo' => $data['code'], 'jornada' => $data['shift'] ?? null];
    }

    /** @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function teacherAssignmentAttributes(array $data, string $careerId): array
    {
        $parallel = Parallel::query()->whereKey($this->stringValue($data, 'parallel_id'))
            ->where('activo', true)
            ->whereHas('offering.subject.curriculum', fn ($query) => $query
                ->where('carrera_id', $careerId)
                ->where('estado', 'activa'))
            ->lockForUpdate()->firstOrFail();
        $userId = $this->stringValue($data, 'user_id');
        $hasRole = RoleAssignment::query()->effective()
            ->where('usuario_id', $userId)
            ->where('carrera_id', $careerId)
            ->whereHas('role', fn ($query) => $query->where('codigo', RoleCode::Teacher->value))
            ->exists();

        if (! $hasRole) {
            throw ValidationException::withMessages([
                'user_id' => 'La persona no tiene un rol Docente vigente en esta carrera.',
            ]);
        }

        return [
            'usuario_id' => $userId,
            'paralelo_id' => $parallel->id,
            'vigente_desde' => $data['valid_from'],
            'vigente_hasta' => $data['valid_until'] ?? null,
        ];
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
