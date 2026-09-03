<?php

namespace App\Modules\Academic\Application\Actions;

use App\Models\User;
use App\Modules\Academic\Application\OfferingModality;
use App\Modules\Academic\Domain\AcademicStructurePermissions;
use App\Modules\Academic\Domain\CurriculumSystemFields;
use App\Modules\Academic\Infrastructure\Persistence\Models\AcademicPeriod;
use App\Modules\Academic\Infrastructure\Persistence\Models\Campus;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\CoordinatorAssignment;
use App\Modules\Academic\Infrastructure\Persistence\Models\CourseOffering;
use App\Modules\Academic\Infrastructure\Persistence\Models\Curriculum;
use App\Modules\Academic\Infrastructure\Persistence\Models\CurriculumFieldDefinition;
use App\Modules\Academic\Infrastructure\Persistence\Models\Faculty;
use App\Modules\Academic\Infrastructure\Persistence\Models\Modality;
use App\Modules\Academic\Infrastructure\Persistence\Models\Parallel;
use App\Modules\Academic\Infrastructure\Persistence\Models\Subject;
use App\Modules\Academic\Infrastructure\Persistence\Models\TeacherAssignment;
use App\Modules\Configuration\Application\InstitutionalLogos;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\InProgressWork;
use App\Modules\Syllabus\Application\ProcessLocks;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CreateAcademicRecord
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly ProcessLocks $locks,
        private readonly InProgressWork $work,
        private readonly SyncSubjectFieldValues $syncSubjectFieldValues,
        private readonly InstitutionalLogos $logos,
        private readonly OfferingModality $modalities,
    ) {}

    /** @param array<string, mixed> $data */
    public function execute(string $entity, array $data, User $actor, Request $request): Model
    {
        $activeRole = $this->roles->resolve($request);

        if (! $activeRole instanceof RoleAssignment || ! AcademicStructurePermissions::mayCreate($activeRole, $entity)) {
            throw new AuthorizationException('No puede gestionar este tipo de registro con el rol activo.');
        }
        // Malla y materias se congelan mientras una convocatoria de la carrera está en
        // curso; ofertas, paralelos y asignaciones siguen editables (relevo docente).
        if (in_array($entity, ['malla', 'asignatura'], true)) {
            $this->locks->assertCareerEditable($activeRole->carrera_id);
            // Lo que el sílabo copia de la malla cambia: el trabajo en curso se borra, con confirmación.
            $this->work->requireConfirmation($request, $activeRole->carrera_id);
        }

        return DB::transaction(function () use ($actor, $activeRole, $data, $entity, $request): Model {
            $record = $this->create($entity, $data, $activeRole);

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole->id,
                action: "academico.{$entity}.creacion",
                resourceType: $entity,
                resourceId: (string) $record->getKey(),
                result: 'exito',
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $record;
        });
    }

    /** @param array<string, mixed> $data */
    private function createFaculty(array $data): Faculty
    {
        $faculty = Faculty::query()->create([
            'codigo_institucional' => $data['code'] ?? null,
            'nombre' => $data['nombre'],
            'activo' => true,
        ]);
        if (($data['logo'] ?? null) instanceof UploadedFile) {
            $this->logos->storeFaculty($faculty, $data['logo']);
        }

        return $faculty;
    }

    /** @param array<string, mixed> $data */
    private function create(string $entity, array $data, RoleAssignment $activeRole): Model
    {
        return match ($entity) {
            'facultad' => $this->createFaculty($data),
            'carrera' => Career::query()->create([
                'facultad_id' => $data['faculty_id'],
                'modalidad_id' => $data['modality_id'],
                'codigo_institucional' => $data['code'] ?? null,
                'nombre' => $data['nombre'],
                'activo' => true,
            ]),
            'campus' => Campus::query()->create([
                'codigo_institucional' => $data['code'] ?? null,
                'nombre' => $data['nombre'],
                'activo' => true,
            ]),
            'modalidad' => Modality::query()->create([
                'codigo' => $data['code'],
                'nombre' => $data['nombre'],
                'combina_por_asignatura' => (bool) ($data['per_subject'] ?? false),
                'activo' => true,
            ]),
            'periodo' => AcademicPeriod::query()->create([
                'codigo' => $data['code'],
                'nombre' => $data['nombre'],
                'fecha_inicio' => $data['starts_on'],
                'fecha_fin' => $data['ends_on'],
                'activo' => true,
            ]),
            'malla' => $this->createCurriculum($data, $this->careerId($activeRole)),
            'asignatura' => $this->createSubject($data, $this->careerId($activeRole)),
            'oferta' => $this->createOffering($data, $this->careerId($activeRole)),
            'paralelo' => $this->createParallel($data, $this->careerId($activeRole)),
            'asignacion_coordinador' => $this->createCoordinatorAssignment($data),
            'asignacion_docente' => $this->createTeacherAssignment($data, $this->careerId($activeRole)),
            default => throw ValidationException::withMessages([
                'entity' => 'El tipo de registro académico no es válido.',
            ]),
        };
    }

    /** @param array<string, mixed> $data */
    private function createCurriculum(array $data, string $careerId): Curriculum
    {
        Career::query()->whereKey($careerId)->lockForUpdate()->firstOrFail();
        if (Curriculum::query()->where('carrera_id', $careerId)->exists()) {
            throw ValidationException::withMessages([
                'curriculum' => 'La carrera ya tiene una malla. Edite la malla actual en lugar de crear otra.',
            ]);
        }

        $curriculum = Curriculum::query()->create([
            'carrera_id' => $careerId,
            'codigo' => $data['code'],
            'numero_ciclos' => 8,
            'estado' => 'activa',
        ]);

        foreach (CurriculumSystemFields::defaults() as $field) {
            CurriculumFieldDefinition::query()->create([
                'malla_id' => $curriculum->id,
                'clave' => $field['key'],
                'etiqueta' => $field['label'],
                'tipo' => $field['type'],
                'clave_sistema' => $field['system_key'],
                'posicion' => $field['position'],
                'visible_en_tarjeta' => true,
                'totalizable' => $field['totalizable'],
                'activo' => true,
            ]);
        }

        return $curriculum;
    }

    /** @param array<string, mixed> $data */
    private function createSubject(array $data, string $careerId): Subject
    {
        $curriculum = Curriculum::query()
            ->whereKey($this->stringValue($data, 'curriculum_id'))
            ->where('carrera_id', $careerId)

            ->lockForUpdate()
            ->firstOrFail();

        if (isset($data['cycle']) && (int) $data['cycle'] > $curriculum->numero_ciclos) {
            throw ValidationException::withMessages([
                'cycle' => 'El ciclo excede la configuración de esta malla.',
            ]);
        }

        $lastPosition = Subject::query()
            ->where('malla_id', $curriculum->id)
            ->where('ciclo', $data['cycle'])
            ->max('orden_en_ciclo');
        $position = array_key_exists('position', $data)
            ? (int) $data['position']
            : ($lastPosition === null ? 0 : (int) $lastPosition + 1);

        $activeSystemKeys = CurriculumFieldDefinition::query()
            ->where('malla_id', $curriculum->id)
            ->where('activo', true)
            ->whereNotNull('clave_sistema')
            ->pluck('clave_sistema');

        $subject = Subject::query()->create([
            'malla_id' => $curriculum->id,
            'codigo_institucional' => $data['code'],
            'nombre' => $data['nombre'],
            'ciclo' => $data['cycle'] ?? null,
            'orden_en_ciclo' => $position,
            'unidad_organizacion_curricular' => $data['organization_unit'] ?? null,
            'modalidad_id' => $this->modalities->subjectModalityId($curriculum->career, $data),
            'creditos' => $data['creditos'] ?? null,
            'horas_totales' => CurriculumSystemFields::totalHours($data, $activeSystemKeys),
            'horas_proyecto' => $data['hours_project'] ?? null,
            'horas_ap' => $data['hours_ap'] ?? null,
            'horas_ac' => $data['horas_ac'] ?? null,
            'horas_pae' => $data['horas_pae'] ?? null,
            'horas_aa' => $data['horas_aa'] ?? null,
            'horas_paec' => $data['hours_paec'] ?? null,
            'activo' => true,
        ]);

        $customValues = $data['custom_values'] ?? [];
        $this->syncSubjectFieldValues->execute($subject, is_array($customValues) ? $customValues : []);

        return $subject;
    }

    /** @param array<string, mixed> $data */
    private function createOffering(array $data, string $careerId): CourseOffering
    {
        $subject = Subject::query()
            ->with('curriculum:id,estado,carrera_id')
            ->whereKey($this->stringValue($data, 'subject_id'))
            ->whereHas('curriculum', fn ($query) => $query
                ->where('carrera_id', $careerId))
            ->lockForUpdate()
            ->firstOrFail();

        if ($subject->curriculum->estado !== 'activa') {
            throw ValidationException::withMessages([
                'subject_id' => 'La oferta requiere una materia de la malla activa.',
            ]);
        }

        $period = AcademicPeriod::query()
            ->whereKey($this->stringValue($data, 'period_id'))
            ->where('activo', true)
            ->where(fn ($query) => $query
                ->whereNull('carrera_id')
                ->orWhere('carrera_id', $careerId))
            ->lockForUpdate()
            ->firstOrFail();

        return CourseOffering::query()->create([
            'periodo_academico_id' => $period->id,
            'asignatura_id' => $subject->id,
            'campus_id' => $data['campus_id'],
            // Heredada: la fija la carrera, o la materia si la carrera combina modalidades.
            'modalidad_id' => $this->modalities->forSubject($subject)->id,
            'activo' => true,
        ]);
    }

    /** @param array<string, mixed> $data */
    private function createParallel(array $data, string $careerId): Parallel
    {
        $offering = CourseOffering::query()
            ->whereKey($this->stringValue($data, 'offering_id'))
            ->whereHas(
                'subject.curriculum',
                fn ($query) => $query
                    ->where('carrera_id', $careerId)
                    ->where('estado', 'activa'),
            )
            ->lockForUpdate()
            ->firstOrFail();

        return Parallel::query()->create([
            'oferta_academica_id' => $offering->id,
            'codigo' => $data['code'],
            'jornada' => $data['shift'] ?? null,
            'activo' => true,
        ]);
    }

    /** @param array<string, mixed> $data */
    private function createCoordinatorAssignment(array $data): CoordinatorAssignment
    {
        $userId = $this->stringValue($data, 'user_id');
        $careerId = $this->stringValue($data, 'career_id');
        $this->ensureScopedRole($userId, $careerId, RoleCode::Coordinator);

        // `quality` es opcional: sin él la asignación es titular, que es el caso normal.
        $quality = is_string($data['quality'] ?? null) && $data['quality'] !== ''
            ? $data['quality']
            : 'titular';

        return CoordinatorAssignment::query()->create([
            'usuario_id' => $userId,
            'carrera_id' => $careerId,
            'vigente_desde' => $data['valid_from'],
            'vigente_hasta' => $data['valid_until'] ?? null,
            'activo' => true,
            // Las atribuciones del encargado son las mismas que las del titular: sus
            // aprobaciones siguen valiendo cuando este vuelve. La distinción es de
            // nombramiento, no de permisos.
            'calidad' => $quality,
            'sustento_tipo' => $data['backing_type'] ?? null,
            'sustento_numero' => $data['backing_number'] ?? null,
            'sustento_fecha' => $data['backing_date'] ?? null,
        ]);
    }

    /** @param array<string, mixed> $data */
    private function createTeacherAssignment(array $data, string $careerId): TeacherAssignment
    {
        $parallel = Parallel::query()
            ->with('offering.subject.curriculum:id,carrera_id,estado')
            ->whereKey($this->stringValue($data, 'parallel_id'))
            ->whereHas(
                'offering.subject.curriculum',
                fn ($query) => $query
                    ->where('carrera_id', $careerId)
                    ->where('estado', 'activa'),
            )
            ->lockForUpdate()
            ->firstOrFail();
        $userId = $this->stringValue($data, 'user_id');
        $this->ensureScopedRole($userId, $careerId, RoleCode::Teacher);

        return TeacherAssignment::query()->create([
            'usuario_id' => $userId,
            'paralelo_id' => $parallel->id,
            'vigente_desde' => $data['valid_from'],
            'vigente_hasta' => $data['valid_until'] ?? null,
            'activo' => true,
        ]);
    }

    private function careerId(RoleAssignment $activeRole): string
    {
        if (! AcademicStructurePermissions::isCareerContext($activeRole) || $activeRole->carrera_id === null) {
            throw new AuthorizationException('Seleccione una coordinación vigente con carrera.');
        }

        return $activeRole->carrera_id;
    }

    private function ensureScopedRole(string $userId, string $careerId, RoleCode $role): void
    {
        $hasRole = RoleAssignment::query()
            ->effective()
            ->where('usuario_id', $userId)
            ->where('carrera_id', $careerId)
            ->whereHas('role', fn ($query) => $query->where('codigo', $role->value))
            ->exists();

        if (! $hasRole) {
            throw ValidationException::withMessages([
                'user_id' => 'La persona no tiene el rol vigente requerido en esta carrera.',
            ]);
        }
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
