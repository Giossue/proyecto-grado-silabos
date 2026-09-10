<?php

namespace App\Modules\Academic\Application\Queries;

use App\Models\User;
use App\Modules\Academic\Application\AcademicPeriodPlanning;
use App\Modules\Academic\Domain\CurriculumSystemFields;
use App\Modules\Academic\Domain\StudyModality;
use App\Modules\Academic\Infrastructure\Persistence\Models\AcademicPeriod;
use App\Modules\Academic\Infrastructure\Persistence\Models\Campus;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\CoordinatorAssignment;
use App\Modules\Academic\Infrastructure\Persistence\Models\Curriculum;
use App\Modules\Academic\Infrastructure\Persistence\Models\CurriculumFieldDefinition;
use App\Modules\Academic\Infrastructure\Persistence\Models\Faculty;
use App\Modules\Academic\Infrastructure\Persistence\Models\Parallel;
use App\Modules\Academic\Infrastructure\Persistence\Models\ScheduledSubject;
use App\Modules\Academic\Infrastructure\Persistence\Models\Subject;
use App\Modules\Academic\Infrastructure\Persistence\Models\SubjectRequirement;
use App\Modules\Academic\Infrastructure\Persistence\Models\TeacherAssignment;
use App\Modules\Configuration\Application\InstitutionalLogos;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Syllabus\Application\ProcessLocks;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusCollaborator;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusScope;

class AcademicStructureViewData
{
    public function __construct(
        private readonly ProcessLocks $locks,
        private readonly InstitutionalLogos $logos,
        private readonly AcademicPeriodPlanning $periodPlanning,
    ) {}

    /** @return array<string, mixed> */
    public function governance(): array
    {
        $lockReason = $this->locks->institutionalStructureLockReason();

        return [
            'lock_reason' => $lockReason,
            'catalogs' => [
                'faculties' => Faculty::query()
                    ->orderBy('nombre')
                    ->get(['id', 'codigo_institucional', 'nombre', 'logo_ruta', 'activo'])
                    ->map(fn (Faculty $faculty): array => [
                        'id' => $faculty->id,
                        'codigo_institucional' => $faculty->codigo_institucional,
                        'nombre' => $faculty->nombre,
                        'activo' => $faculty->activo,
                        'logo_url' => route('logos.faculty', ['faculty' => $faculty->id, 'v' => $this->logos->version($this->logos->facultyPath($faculty))]),
                    ]),
                'careers' => Career::query()
                    ->with(['campus:id,nombre', 'coordinatorAssignments' => fn ($query) => $query->effective()->with('user:id,nombre,correo_electronico')])
                    ->orderBy('nombre')
                    ->get(['id', 'facultad_id', 'modalidad', 'campus_id', 'codigo_institucional', 'nombre', 'activo'])
                    ->map(fn (Career $career) => [
                        'id' => $career->id,
                        'faculty_id' => $career->facultad_id,
                        // Quién coordina hoy: la acción «Reemplazar coordinador» parte de aquí.
                        'coordinator' => $career->coordinatorAssignments->first()?->user === null ? null : [
                            'id' => $career->coordinatorAssignments->first()->user->id,
                            'name' => $career->coordinatorAssignments->first()->user->nombre,
                        ],
                        // Modalidad base aprobada por Administración; las excepciones de
                        // materias no modifican este dato de la carrera.
                        'modality' => $career->modalidad?->value,
                        'modality_label' => $career->modalidad?->label(),
                        'campus_id' => $career->campus_id,
                        'campus_name' => $career->campus?->nombre,
                        'code' => $career->codigo_institucional,
                        'name' => $career->nombre,
                        'active' => $career->activo,
                    ]),
                'campuses' => Campus::query()
                    ->orderBy('nombre')
                    ->get(['id', 'codigo_institucional', 'nombre', 'activo']),
                'periods' => AcademicPeriod::query()
                    ->orderByDesc('fecha_inicio')
                    ->get()
                    ->map(fn (AcademicPeriod $period) => [
                        'id' => $period->id,
                        'code' => $period->codigo,
                        'name' => $period->nombre,
                        'starts_on' => $period->fecha_inicio->toDateString(),
                        'ends_on' => $period->fecha_fin->toDateString(),
                        'teaching_weeks' => $period->semanas_lectivas,
                        'active' => $period->activo,
                    ]),
            ],
            'options' => [
                ...$this->emptyOptions(),
                'faculties' => Faculty::query()
                    ->where('activo', true)
                    ->orderBy('nombre')
                    ->get(['id', 'nombre']),
                'campuses' => Campus::query()->where('activo', true)->orderBy('nombre')->get(['id', 'nombre']),
                // Cualquier cuenta activa puede asumir una coordinación: el rol se concede al nombrarla.
                'coordinatorUsers' => User::query()->where('activo', true)->orderBy('nombre')->get(['id', 'nombre', 'correo_electronico']),
            ],
        ];
    }

    /** @return array<string, mixed> */
    public function coordinations(): array
    {
        return [
            'coordinatorAssignments' => CoordinatorAssignment::query()
                ->with(['user:id,nombre,correo_electronico', 'career:id,nombre'])
                ->orderByDesc('activo')
                ->orderBy('carrera_id')
                ->get()
                ->map(fn (CoordinatorAssignment $assignment) => [
                    'id' => $assignment->id,
                    'user_name' => $assignment->user->nombre,
                    'career_name' => $assignment->career->nombre,
                    'active' => $assignment->activo,
                ]),
            'options' => [
                ...$this->emptyOptions(),
                'careers' => Career::query()
                    ->where('activo', true)
                    ->orderBy('nombre')
                    ->get(['id', 'nombre']),
                'coordinatorUsers' => User::query()
                    ->where('activo', true)
                    ->whereIn('id', RoleAssignment::query()
                        ->select('usuario_id')
                        ->effective()
                        ->whereHas('role', fn ($query) => $query->where('codigo', RoleCode::Coordinator->value)))
                    ->orderBy('nombre')
                    ->get(['id', 'nombre', 'correo_electronico']),
            ],
        ];
    }

    /** @return array<string, mixed> */
    public function curricula(string $careerId): array
    {
        $career = $this->career($careerId);

        return [
            'career' => ['id' => $career->id, 'name' => $career->nombre],
            'options' => $this->emptyOptions(),
        ];
    }

    public function currentCurriculumId(string $careerId): ?string
    {
        $id = Curriculum::query()
            ->where('carrera_id', $careerId)
            ->value('id');

        return is_string($id) ? $id : null;
    }

    /** @return array<string, mixed> */
    public function curriculumBuilder(string $careerId, string $curriculumId): array
    {
        $career = $this->career($careerId);
        $curriculum = Curriculum::query()
            ->where('carrera_id', $careerId)
            ->with([
                'fieldDefinitions' => fn ($query) => $query
                    ->where('activo', true)
                    ->orderBy('posicion')
                    ->orderBy('etiqueta'),
                'subjects' => fn ($query) => $query
                    ->with('fieldValues')
                    ->orderBy('ciclo')
                    ->orderBy('orden_en_ciclo')
                    ->orderBy('nombre'),
            ])
            ->findOrFail($curriculumId);
        $definitions = $curriculum->fieldDefinitions;
        $subjectIds = $curriculum->subjects->pluck('id');
        // La malla se congela mientras una convocatoria de la carrera está en curso; la
        // razón viaja a la pantalla para que explique el bloqueo con las mismas palabras.
        $lockReason = $this->locks->careerLockReason($careerId);

        return [
            'career' => [
                'id' => $career->id,
                'name' => $career->nombre,
                // Base aprobada de la carrera; una materia puede tener una excepción.
                'modality' => $career->modalidad === null ? null : [
                    'value' => $career->modalidad->value,
                    'label' => $career->modalidad->label(),
                ],
            ],
            'curriculum' => [
                'id' => $curriculum->id,
                'code' => $curriculum->codigo,
                'cycle_count' => $curriculum->numero_ciclos,
                'state' => $curriculum->estado,
                'active' => $curriculum->estado === 'activa',
                'editable' => $lockReason === null,
                'lock_reason' => $lockReason,
            ],
            'fieldDefinitions' => $definitions->map(fn (CurriculumFieldDefinition $field) => [
                'id' => $field->id,
                'key' => $field->clave,
                'label' => $field->etiqueta,
                'type' => $field->tipo,
                'system_key' => $field->clave_sistema,
                'system_label' => $field->clave_sistema === null
                    ? null
                    : CurriculumSystemFields::LABELS[$field->clave_sistema] ?? null,
                'position' => $field->posicion,
                'visible_on_card' => $field->visible_en_tarjeta,
                'totalizable' => $field->totalizable,
            ])->values(),
            'fieldTotals' => $definitions
                ->where('totalizable', true)
                ->map(function (CurriculumFieldDefinition $field) use ($curriculum): array {
                    $value = $curriculum->subjects->sum(function (Subject $subject) use ($field): float|int {
                        $rawValue = $field->clave_sistema === null
                            ? $subject->fieldValues->firstWhere('definicion_campo_id', $field->id)?->valor
                            : CurriculumSystemFields::value($subject, $field->clave_sistema);

                        return is_numeric($rawValue) ? $rawValue + 0 : 0;
                    });

                    return [
                        'id' => $field->id,
                        'label' => $field->etiqueta,
                        'value' => $value,
                    ];
                })->values(),
            'subjects' => $curriculum->subjects->map(function (Subject $subject) use ($definitions): array {
                $customValues = $subject->fieldValues->keyBy('definicion_campo_id');

                return [
                    'id' => $subject->id,
                    'code' => $subject->codigo_institucional,
                    'name' => $subject->nombre,
                    'cycle' => $subject->ciclo,
                    'position' => $subject->orden_en_ciclo,
                    'organization_unit' => $subject->unidad_organizacion_curricular,
                    'modality' => $subject->modalidad?->value,
                    'modality_label' => $subject->modalidad?->label(),
                    'credits' => $subject->creditos,
                    'total_hours' => $subject->horas_totales,
                    'active' => $subject->activo,
                    'custom_values' => $customValues->mapWithKeys(
                        fn ($value, string $definitionId) => [$definitionId => $value->valor],
                    ),
                    'system_values' => collect(CurriculumSystemFields::ATTRIBUTES)->mapWithKeys(
                        fn (string $attribute, string $key) => [$key => $subject->getAttribute($attribute)],
                    ),
                    'display_fields' => $definitions
                        ->where('visible_en_tarjeta', true)
                        ->map(fn (CurriculumFieldDefinition $field) => [
                            'id' => $field->id,
                            'label' => $field->etiqueta,
                            'value' => $field->clave_sistema === null
                                ? $customValues->get($field->id)?->valor
                                : CurriculumSystemFields::value($subject, $field->clave_sistema),
                        ])->values(),
                ];
            })->values(),
            'requirements' => SubjectRequirement::query()
                ->whereIn('asignatura_id', $subjectIds)
                ->whereIn('requisito_id', $subjectIds)
                ->orderBy('tipo')
                ->orderBy('id')
                ->get(['id', 'asignatura_id', 'requisito_id', 'tipo'])
                ->map(fn (SubjectRequirement $requirement) => [
                    'id' => $requirement->id,
                    'subject_id' => $requirement->asignatura_id,
                    'requirement_id' => $requirement->requisito_id,
                    'type' => $requirement->tipo,
                ]),
            'systemFieldOptions' => collect(CurriculumSystemFields::ATTRIBUTES)
                ->keys()
                ->map(fn (string $key) => [
                    'value' => $key,
                    'label' => CurriculumSystemFields::LABELS[$key],
                ])
                ->values(),
            'modalityOptions' => StudyModality::options(),
            'options' => $this->emptyOptions(),
        ];
    }

    /** @return array<string, mixed> */
    public function scheduledSubjects(string $careerId, ?string $requestedPeriodId = null): array
    {
        $career = $this->career($careerId);
        $lockReason = $this->locks->careerLockReason($careerId);
        $scheduledSubjects = ScheduledSubject::query()
            ->whereHas('subject.curriculum', fn ($query) => $query
                ->where('carrera_id', $careerId))
            ->with([
                'academicPeriod:id,fecha_inicio,fecha_fin,activo',
                'subject:id,nombre,codigo_institucional,ciclo',
                'campus:id,nombre',
                'parallels' => fn ($query) => $query
                    ->orderBy('codigo')
                    ->select(['id', 'programacion_asignatura_id', 'codigo', 'jornada', 'activo']),
            ])
            ->orderBy('asignatura_id')
            ->get();
        $usedScheduledSubjectIds = SyllabusScope::query()
            ->whereIn('programacion_asignatura_id', $scheduledSubjects->pluck('id'))
            ->pluck('programacion_asignatura_id')
            ->flip();
        $periodIdsWithHistory = $scheduledSubjects->pluck('periodo_academico_id');
        $periods = AcademicPeriod::query()
            ->where('activo', true)
            ->orWhereIn('id', $periodIdsWithHistory)
            ->get(['id', 'nombre', 'fecha_inicio', 'fecha_fin', 'activo'])
            ->sort(function (AcademicPeriod $left, AcademicPeriod $right): int {
                $rank = [
                    AcademicPeriodPlanning::CURRENT => 0,
                    AcademicPeriodPlanning::UPCOMING => 1,
                    AcademicPeriodPlanning::FINISHED => 2,
                ];
                $leftStatus = $this->periodPlanning->status($left);
                $rightStatus = $this->periodPlanning->status($right);
                $byStatus = $rank[$leftStatus] <=> $rank[$rightStatus];

                if ($byStatus !== 0) {
                    return $byStatus;
                }

                return $leftStatus === AcademicPeriodPlanning::UPCOMING
                    ? $left->fecha_inicio <=> $right->fecha_inicio
                    : $right->fecha_inicio <=> $left->fecha_inicio;
            })
            ->values();
        $selectedPeriodId = $periods->contains('id', $requestedPeriodId)
            ? $requestedPeriodId
            : $periods->first(fn (AcademicPeriod $period): bool => $this->periodPlanning->status($period) === AcademicPeriodPlanning::CURRENT)?->id;
        $selectedPeriodId ??= $periods->first(fn (AcademicPeriod $period): bool => $this->periodPlanning->status($period) === AcademicPeriodPlanning::UPCOMING)?->id;
        $selectedPeriodId ??= $periods->first()?->id;

        return [
            'career' => [
                'id' => $career->id,
                'name' => $career->nombre,
                'lock_reason' => $lockReason,
            ],
            'selectedPeriodId' => $selectedPeriodId,
            'scheduledSubjects' => $scheduledSubjects
                ->map(function (ScheduledSubject $scheduledSubject) use ($lockReason, $usedScheduledSubjectIds): array {
                    $periodPlanningEnabled = $this->periodPlanning->mayPlan($scheduledSubject->academicPeriod);

                    return [
                        'id' => $scheduledSubject->id,
                        'subject_id' => $scheduledSubject->asignatura_id,
                        'period_id' => $scheduledSubject->periodo_academico_id,
                        'campus_id' => $scheduledSubject->campus_id,
                        'label' => "{$scheduledSubject->subject->codigo_institucional} · {$scheduledSubject->subject->nombre}",
                        'subject_code' => $scheduledSubject->subject->codigo_institucional,
                        'subject_name' => $scheduledSubject->subject->nombre,
                        'subject_cycle' => $scheduledSubject->subject->ciclo,
                        'period_starts_on' => $scheduledSubject->academicPeriod->fecha_inicio->toDateString(),
                        'period_ends_on' => $scheduledSubject->academicPeriod->fecha_fin->toDateString(),
                        'period_status' => $this->periodPlanning->status($scheduledSubject->academicPeriod),
                        'period_status_label' => $this->periodPlanning->label($scheduledSubject->academicPeriod),
                        'period_planning_enabled' => $periodPlanningEnabled,
                        'campus_name' => $scheduledSubject->campus->nombre,
                        'modality_name' => $scheduledSubject->modalidad->label(),
                        'parallels' => $scheduledSubject->parallels
                            ->map(fn (Parallel $parallel): array => [
                                'id' => $parallel->id,
                                'code' => $parallel->codigo,
                                'shift' => $this->parallelShift($parallel),
                                'active' => $parallel->activo,
                            ])
                            ->values()
                            ->all(),
                        'active' => $scheduledSubject->activo,
                        'editable' => $periodPlanningEnabled && $lockReason === null && ! $usedScheduledSubjectIds->has($scheduledSubject->id),
                    ];
                }),
            'options' => [
                ...$this->emptyOptions(),
                'periods' => $periods
                    ->map(fn (AcademicPeriod $period): array => [
                        'id' => $period->id,
                        'nombre' => $period->nombre,
                        'starts_on' => $period->fecha_inicio->toDateString(),
                        'ends_on' => $period->fecha_fin->toDateString(),
                        'active' => $period->activo,
                        'status' => $this->periodPlanning->status($period),
                        'status_label' => $this->periodPlanning->label($period),
                        'planning_enabled' => $this->periodPlanning->mayPlan($period),
                    ]),
                'campuses' => Campus::query()->where('activo', true)->orderBy('nombre')->get(['id', 'nombre']),
                'activeSubjects' => Subject::query()
                    ->where('activo', true)
                    ->whereHas('curriculum', fn ($query) => $query
                        ->where('carrera_id', $careerId)
                        ->where('estado', 'activa'))
                    ->orderBy('ciclo')
                    ->orderBy('orden_en_ciclo')
                    ->orderBy('nombre')
                    ->get(['id', 'codigo_institucional', 'nombre', 'ciclo']),
                'scheduledSubjects' => ScheduledSubject::query()
                    ->where('activo', true)
                    ->whereHas('subject.curriculum', fn ($query) => $query
                        ->where('carrera_id', $careerId)
                        ->where('estado', 'activa'))
                    ->with(['subject:id,codigo_institucional,nombre', 'academicPeriod:id,nombre,fecha_inicio,fecha_fin,activo'])
                    ->get()
                    ->filter(fn (ScheduledSubject $scheduledSubject): bool => $this->periodPlanning->mayPlan($scheduledSubject->academicPeriod))
                    ->map(fn (ScheduledSubject $scheduledSubject) => [
                        'id' => $scheduledSubject->id,
                        'label' => "{$scheduledSubject->subject->codigo_institucional} · {$scheduledSubject->academicPeriod->nombre}",
                        'subject_id' => $scheduledSubject->asignatura_id,
                        'period_id' => $scheduledSubject->periodo_academico_id,
                    ]),
            ],
        ];
    }

    /** @return array<string, mixed> */
    public function teacherAssignments(string $careerId): array
    {
        $career = $this->career($careerId);
        $lockReason = $this->locks->careerLockReason($careerId);
        $teacherAssignments = TeacherAssignment::query()
            ->whereHas(
                'parallel.scheduledSubject.subject.curriculum',
                fn ($query) => $query->where('carrera_id', $careerId),
            )
            ->with([
                'user:id,nombre,correo_electronico',
                'parallel.scheduledSubject.subject:id,nombre,codigo_institucional',
                'parallel.scheduledSubject.academicPeriod:id,nombre,fecha_inicio,fecha_fin,activo',
            ])
            ->orderByDesc('asignado_en')
            ->get();
        $usedAssignmentIds = SyllabusCollaborator::query()
            ->whereIn('asignacion_docente_id', $teacherAssignments->pluck('id'))
            ->pluck('asignacion_docente_id')
            ->flip();

        return [
            'career' => [
                'id' => $career->id,
                'name' => $career->nombre,
                'lock_reason' => $lockReason,
            ],
            'teacherAssignments' => $teacherAssignments
                ->map(fn (TeacherAssignment $assignment) => [
                    'id' => $assignment->id,
                    'user_id' => $assignment->user->id,
                    'parallel_id' => $assignment->paralelo_id,
                    'user_name' => $assignment->user->nombre,
                    'user_email' => $assignment->user->correo_electronico,
                    'parallel_code' => $assignment->parallel->codigo,
                    'subject_name' => $assignment->parallel->scheduledSubject->subject->nombre,
                    'period_name' => $assignment->parallel->scheduledSubject->academicPeriod->nombre,
                    'period_status' => $this->periodPlanning->status($assignment->parallel->scheduledSubject->academicPeriod),
                    'period_planning_enabled' => $this->periodPlanning->mayPlan($assignment->parallel->scheduledSubject->academicPeriod),
                    'active' => $assignment->activo,
                    'editable' => $this->periodPlanning->mayPlan($assignment->parallel->scheduledSubject->academicPeriod)
                        && $lockReason === null
                        && ! $usedAssignmentIds->has($assignment->id),
                ]),
            'options' => [
                ...$this->emptyOptions(),
                'parallels' => Parallel::query()
                    ->where('activo', true)
                    ->whereHas(
                        'scheduledSubject.subject.curriculum',
                        fn ($query) => $query
                            ->where('carrera_id', $careerId)
                            ->where('estado', 'activa'),
                    )
                    ->with([
                        'scheduledSubject.subject:id,codigo_institucional,nombre',
                        'scheduledSubject.academicPeriod:id,nombre,fecha_inicio,fecha_fin,activo',
                    ])
                    ->get()
                    ->filter(fn (Parallel $parallel): bool => $this->periodPlanning->mayPlan($parallel->scheduledSubject->academicPeriod))
                    ->map(fn (Parallel $parallel) => [
                        'id' => $parallel->id,
                        'label' => "{$parallel->scheduledSubject->subject->nombre} · {$parallel->scheduledSubject->academicPeriod->nombre} · Paralelo {$parallel->codigo}",
                    ]),
                'teacherUsers' => User::query()
                    ->where('activo', true)
                    ->whereIn('id', RoleAssignment::query()
                        ->select('usuario_id')
                        ->effective()
                        ->where('carrera_id', $careerId)
                        ->whereHas('role', fn ($query) => $query->where('codigo', RoleCode::Teacher->value)))
                    ->orderBy('nombre')
                    ->get(['id', 'nombre', 'correo_electronico'])
                    ->map(fn (User $user): array => [
                        'id' => $user->id,
                        'name' => $user->nombre,
                        'email' => $user->correo_electronico,
                    ]),
            ],
        ];
    }

    private function career(string $careerId): Career
    {
        return Career::query()->where('activo', true)->findOrFail($careerId);
    }

    private function parallelShift(Parallel $parallel): ?string
    {
        $shift = $parallel->getAttribute('jornada');

        return is_string($shift) ? $shift : null;
    }

    /** @return array<string, array<never, never>> */
    private function emptyOptions(): array
    {
        return [
            'faculties' => [],
            'careers' => [],
            'periods' => [],
            'campuses' => [],
            'currentCurricula' => [],
            'activeSubjects' => [],
            'scheduledSubjects' => [],
            'parallels' => [],
            'coordinatorUsers' => [],
            'teacherUsers' => [],
        ];
    }
}
