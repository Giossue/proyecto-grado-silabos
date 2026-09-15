<?php

namespace App\Modules\Academic\Application\Actions;

use App\Models\User;
use App\Modules\Academic\Domain\AcademicStructurePermissions;
use App\Modules\Academic\Infrastructure\Persistence\Models\AcademicPeriod;
use App\Modules\Academic\Infrastructure\Persistence\Models\Campus;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\Faculty;
use App\Modules\Configuration\Application\InstitutionalLogos;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\ProcessLocks;
use DateTimeInterface;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class UpdateAcademicRecord
{
    /** @var array<string, class-string<Model>> */
    private const MODELS = [
        'facultad' => Faculty::class,
        'carrera' => Career::class,
        'campus' => Campus::class,
        'periodo' => AcademicPeriod::class,
    ];

    /** @var array<string, string> */
    private const FIELD_LABELS = [
        'facultad_id' => 'Facultad',
        'codigo_facultad' => 'Código de facultad',
        'codigo_campus' => 'Código de campus',
        'codigo_carrera' => 'Código de carrera',
        'codigo_periodo_academico' => 'Código de período',
        'nombre_facultad' => 'Nombre',
        'nombre_campus' => 'Nombre',
        'nombre_carrera' => 'Nombre',
        'fecha_inicio_periodo' => 'Fecha de inicio',
        'fecha_fin_periodo' => 'Fecha de fin',
        'cantidad_semanas_lectivas' => 'Semanas lectivas',
    ];

    /** @var array<string, string> */
    private const AUDIT_KEYS = [
        'codigo_facultad' => 'code',
        'codigo_campus' => 'code',
        'codigo_carrera' => 'code',
        'codigo_periodo_academico' => 'code',
        'nombre_facultad' => 'name',
        'nombre_campus' => 'name',
        'nombre_carrera' => 'name',
        'fecha_inicio_periodo' => 'starts_on',
        'fecha_fin_periodo' => 'ends_on',
        'cantidad_semanas_lectivas' => 'teaching_weeks',
    ];

    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly InstitutionalLogos $logos,
        private readonly ProcessLocks $locks,
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
        $this->locks->assertInstitutionalStructureEditable();

        return DB::transaction(function () use ($actor, $activeRole, $data, $entity, $modelClass, $recordId, $request): Model {
            $record = $modelClass::query()->lockForUpdate()->findOrFail($recordId);
            $attributes = $this->attributes($entity, $data);

            if ($entity === 'carrera') {
                $this->ensureActiveFacultyWhenChanging($record, (string) $attributes['facultad_id']);
            }

            $record->fill($attributes);
            if ($record instanceof Faculty && ($data['logo'] ?? null) instanceof UploadedFile) {
                $record->logo_ruta = $this->logos->storeFaculty($record, $data['logo']);
            }
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
            'facultad' => [
                'codigo_facultad' => $data['code'] ?? null,
                'nombre' => $data['nombre'],
            ],
            'campus' => [
                'codigo_campus' => $data['code'] ?? null,
                'nombre' => $data['nombre'],
            ],
            'carrera' => [
                'facultad_id' => $data['faculty_id'],
                'modalidad' => $data['modality'],
                'campus_id' => $data['campus_id'],
                'codigo_carrera' => $data['code'] ?? null,
                'nombre' => $data['nombre'],
            ],
            'periodo' => [
                'codigo' => $data['code'],
                'fecha_inicio' => $data['starts_on'],
                'fecha_fin' => $data['ends_on'],
                'semanas_lectivas' => $data['teaching_weeks'],
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
