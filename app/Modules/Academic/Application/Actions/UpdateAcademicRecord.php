<?php

namespace App\Modules\Academic\Application\Actions;

use App\Models\User;
use App\Modules\Academic\Domain\AcademicStructurePermissions;
use App\Modules\Academic\Infrastructure\Persistence\Models\AcademicPeriod;
use App\Modules\Academic\Infrastructure\Persistence\Models\Campus;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\Faculty;
use App\Modules\Academic\Infrastructure\Persistence\Models\Modality;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use DateTimeInterface;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class UpdateAcademicRecord
{
    /** @var array<string, class-string<Model>> */
    private const MODELS = [
        'facultad' => Faculty::class,
        'carrera' => Career::class,
        'campus' => Campus::class,
        'modalidad' => Modality::class,
        'periodo' => AcademicPeriod::class,
    ];

    /** @var array<string, string> */
    private const FIELD_LABELS = [
        'facultad_id' => 'Facultad',
        'codigo_institucional' => 'Código institucional',
        'codigo' => 'Código estable',
        'nombre' => 'Nombre',
        'fecha_inicio' => 'Fecha de inicio',
        'fecha_fin' => 'Fecha de fin',
    ];

    /** @var array<string, string> */
    private const AUDIT_KEYS = [
        'codigo_institucional' => 'code',
        'codigo' => 'code',
        'nombre' => 'name',
        'fecha_inicio' => 'starts_on',
        'fecha_fin' => 'ends_on',
    ];

    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    /** @param array<string, mixed> $data */
    public function execute(
        string $entity,
        string $recordId,
        array $data,
        User $actor,
        Request $request,
    ): Model {
        $modelClass = self::MODELS[$entity] ?? null;
        $activeRole = $this->roles->resolve($request);

        if ($modelClass === null
            || ! $activeRole instanceof RoleAssignment
            || ! AcademicStructurePermissions::mayUpdate($activeRole, $entity)) {
            throw new AuthorizationException('No puede editar este registro con el rol activo.');
        }

        return DB::transaction(function () use ($actor, $activeRole, $data, $entity, $modelClass, $recordId, $request): Model {
            $record = $modelClass::query()->lockForUpdate()->findOrFail($recordId);
            $attributes = $this->attributes($entity, $data);

            if ($entity === 'carrera') {
                $this->ensureActiveFacultyWhenChanging($record, (string) $attributes['facultad_id']);
            }

            $record->fill($attributes);
            $dirty = $record->getDirty();

            if ($dirty === []) {
                return $record;
            }

            $auditMetadata = $this->auditContext($record, $dirty, $entity);
            $record->save();

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole->id,
                action: "academico.{$entity}.actualizacion",
                resourceType: $entity,
                resourceId: (string) $record->getKey(),
                result: 'exito',
                metadata: $auditMetadata,
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $record;
        });
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function attributes(string $entity, array $data): array
    {
        return match ($entity) {
            'facultad', 'campus' => [
                'codigo_institucional' => $data['code'] ?? null,
                'nombre' => $data['nombre'],
            ],
            'carrera' => [
                'facultad_id' => $data['faculty_id'],
                'codigo_institucional' => $data['code'] ?? null,
                'nombre' => $data['nombre'],
            ],
            'modalidad' => [
                'codigo' => $data['code'],
                'nombre' => $data['nombre'],
            ],
            'periodo' => [
                'codigo' => $data['code'],
                'nombre' => $data['nombre'],
                'fecha_inicio' => $data['starts_on'],
                'fecha_fin' => $data['ends_on'],
            ],
            default => throw ValidationException::withMessages([
                'entity' => 'El tipo de registro no admite edición.',
            ]),
        };
    }

    private function ensureActiveFacultyWhenChanging(Model $record, string $facultyId): void
    {
        if ($record->getAttribute('facultad_id') === $facultyId) {
            return;
        }

        $faculty = Faculty::query()->lockForUpdate()->find($facultyId);

        if (! $faculty instanceof Faculty || ! (bool) $faculty->getAttribute('activo')) {
            throw ValidationException::withMessages([
                'faculty_id' => 'Seleccione una facultad activa para reasignar la carrera.',
            ]);
        }
    }

    /**
     * @param  array<string, mixed>  $dirty
     * @return array<string, bool|float|int|string|null>
     */
    private function auditContext(Model $record, array $dirty, string $entity): array
    {
        $activeRole = [
            'changed_fields' => implode(', ', array_map(
                fn (string $field): string => self::FIELD_LABELS[$field] ?? $field,
                array_keys($dirty),
            )),
        ];

        foreach (array_keys($dirty) as $field) {
            if ($entity === 'carrera' && $field === 'facultad_id') {
                $this->addFacultyChange($activeRole, $record);

                continue;
            }

            $auditKey = self::AUDIT_KEYS[$field] ?? $field;
            $activeRole["before_{$auditKey}"] = $this->scalarValue($record->getRawOriginal($field));
            $activeRole["after_{$auditKey}"] = $this->scalarValue($record->getAttribute($field));
        }

        return $activeRole;
    }

    /** @param array<string, bool|float|int|string|null> $activeRole */
    private function addFacultyChange(array &$activeRole, Model $record): void
    {
        $beforeId = (string) $record->getRawOriginal('facultad_id');
        $afterId = (string) $record->getAttribute('facultad_id');
        $names = Faculty::query()
            ->whereIn('id', [$beforeId, $afterId])
            ->pluck('nombre', 'id');

        $activeRole['before_faculty_id'] = $beforeId;
        $activeRole['after_faculty_id'] = $afterId;
        $activeRole['before_faculty'] = $this->scalarValue($names->get($beforeId));
        $activeRole['after_faculty'] = $this->scalarValue($names->get($afterId));
    }

    private function scalarValue(mixed $value): bool|float|int|string|null
    {
        if ($value instanceof DateTimeInterface) {
            return $value->format('Y-m-d');
        }

        if (is_bool($value) || is_float($value) || is_int($value) || is_string($value)) {
            return $value;
        }

        return null;
    }
}
