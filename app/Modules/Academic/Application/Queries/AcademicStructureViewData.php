<?php

namespace App\Modules\Academic\Application\Queries;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\AcademicPeriod;
use App\Modules\Academic\Infrastructure\Persistence\Models\Campus;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\CoordinatorAssignment;
use App\Modules\Academic\Infrastructure\Persistence\Models\CourseOffering;
use App\Modules\Academic\Infrastructure\Persistence\Models\CurriculumVersion;
use App\Modules\Academic\Infrastructure\Persistence\Models\Faculty;
use App\Modules\Academic\Infrastructure\Persistence\Models\Modality;
use App\Modules\Academic\Infrastructure\Persistence\Models\Parallel;
use App\Modules\Academic\Infrastructure\Persistence\Models\Subject;
use App\Modules\Academic\Infrastructure\Persistence\Models\TeacherAssignment;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusCollaborator;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusScope;

class AcademicStructureViewData
{
    /** @return array<string, mixed> */
    public function governance(): array
    {
        return [
            'catalogs' => [
                'faculties' => Faculty::query()
                    ->orderBy('nombre')
                    ->get(['id', 'codigo_institucional', 'nombre', 'activo']),
                'careers' => Career::query()
                    ->orderBy('nombre')
                    ->get(['id', 'facultad_id', 'codigo_institucional', 'nombre', 'activo'])
                    ->map(fn (Career $career) => [
                        'id' => $career->id,
                        'faculty_id' => $career->facultad_id,
                        'code' => $career->codigo_institucional,
                        'name' => $career->nombre,
                        'active' => $career->activo,
                    ]),
                'campuses' => Campus::query()
                    ->orderBy('nombre')
                    ->get(['id', 'codigo_institucional', 'nombre', 'activo']),
                'modalities' => Modality::query()
                    ->orderBy('nombre')
                    ->get(['id', 'codigo', 'nombre', 'activo']),
                'periods' => AcademicPeriod::query()
                    ->orderByDesc('fecha_inicio')
                    ->get()
                    ->map(fn (AcademicPeriod $period) => [
                        'id' => $period->id,
                        'code' => $period->codigo,
                        'name' => $period->nombre,
                        'starts_on' => $period->fecha_inicio->toDateString(),
                        'ends_on' => $period->fecha_fin->toDateString(),
                        'active' => $period->activo,
                    ]),
            ],
            'options' => [
                ...$this->emptyOptions(),
                'faculties' => Faculty::query()
                    ->where('activo', true)
                    ->orderBy('nombre')
                    ->get(['id', 'nombre']),
            ],
        ];
    }

    /** @return array<string, mixed> */
    public function coordinations(): array
    {
        return [
            'coordinatorAssignments' => CoordinatorAssignment::query()
                ->with(['user:id,name,email', 'career:id,nombre'])
                ->orderByDesc('vigente_desde')
                ->get()
                ->map(fn (CoordinatorAssignment $assignment) => [
                    'id' => $assignment->id,
                    'user_name' => $assignment->user->name,
                    'career_name' => $assignment->career->nombre,
                    'valid_from' => $assignment->vigente_desde->toDateString(),
                    'valid_until' => $assignment->vigente_hasta?->toDateString(),
                    'active' => $assignment->activo,
                ]),
            'options' => [
                ...$this->emptyOptions(),
                'careers' => Career::query()
                    ->where('activo', true)
                    ->orderBy('nombre')
                    ->get(['id', 'nombre']),
                'coordinatorUsers' => User::query()
                    ->where('active', true)
                    ->whereIn('id', RoleAssignment::query()
                        ->select('usuario_id')
                        ->effective()
                        ->whereHas('role', fn ($query) => $query->where('codigo', RoleCode::Coordinator->value)))
                    ->orderBy('name')
                    ->get(['id', 'name', 'email']),
            ],
        ];
    }

    /** @return array<string, mixed> */
    public function curricula(string $careerId): array
    {
        $career = $this->career($careerId);

        return [
            'career' => ['id' => $career->id, 'name' => $career->nombre],
            'curricula' => CurriculumVersion::query()
                ->where('carrera_id', $careerId)
                ->with('career:id,nombre')
                ->withCount('subjects')
                ->orderByDesc('created_at')
                ->get()
                ->map(fn (CurriculumVersion $curriculum) => [
                    'id' => $curriculum->id,
                    'code' => $curriculum->codigo,
                    'version_number' => $curriculum->numero_version,
                    'state' => $curriculum->estado,
                    'career_name' => $curriculum->career->nombre,
                    'subject_count' => $curriculum->subjects_count,
                    'published_at' => $curriculum->publicado_en?->toIso8601String(),
                    'editable' => $curriculum->estado === 'draft',
                ]),
            'subjects' => Subject::query()
                ->whereHas('curriculumVersion', fn ($query) => $query->where('carrera_id', $careerId))
                ->with('curriculumVersion.career:id,nombre')
                ->orderBy('nombre')
                ->get()
                ->map(fn (Subject $subject) => [
                    'id' => $subject->id,
                    'code' => $subject->codigo_institucional,
                    'name' => $subject->nombre,
                    'cycle' => $subject->ciclo,
                    'credits' => $subject->creditos,
                    'total_hours' => $subject->horas_totales,
                    'active' => $subject->activo,
                    'curriculum_code' => $subject->curriculumVersion->codigo,
                    'curriculum_id' => $subject->version_malla_id,
                    'career_name' => $subject->curriculumVersion->career->nombre,
                    'editable' => $subject->curriculumVersion->estado === 'draft',
                ]),
            'options' => [
                ...$this->emptyOptions(),
                'draftCurricula' => CurriculumVersion::query()
                    ->where('carrera_id', $careerId)
                    ->where('estado', 'draft')
                    ->orderBy('codigo')
                    ->get(['id', 'codigo']),
            ],
        ];
    }

    /** @return array<string, mixed> */
    public function offerings(string $careerId): array
    {
        $career = $this->career($careerId);
        $offerings = CourseOffering::query()
            ->whereHas('subject.curriculumVersion', fn ($query) => $query->where('carrera_id', $careerId))
            ->with([
                'academicPeriod:id,nombre',
                'subject:id,nombre,codigo_institucional',
                'campus:id,nombre',
                'modality:id,nombre',
            ])
            ->withCount('parallels')
            ->orderByDesc('created_at')
            ->get();
        $parallels = Parallel::query()
            ->whereHas('offering.subject.curriculumVersion', fn ($query) => $query->where('carrera_id', $careerId))
            ->with(['offering.subject:id,nombre,codigo_institucional', 'offering.academicPeriod:id,nombre'])
            ->orderBy('codigo')
            ->get();
        $usedOfferingIds = SyllabusScope::query()
            ->whereIn('oferta_academica_id', $offerings->pluck('id'))
            ->pluck('oferta_academica_id')
            ->flip();
        $usedParallelIds = SyllabusScope::query()
            ->whereIn('paralelo_id', $parallels->pluck('id'))
            ->pluck('paralelo_id')
            ->flip();

        return [
            'career' => ['id' => $career->id, 'name' => $career->nombre],
            'offerings' => $offerings
                ->map(fn (CourseOffering $offering) => [
                    'id' => $offering->id,
                    'subject_id' => $offering->asignatura_id,
                    'period_id' => $offering->periodo_academico_id,
                    'campus_id' => $offering->campus_id,
                    'modality_id' => $offering->modalidad_id,
                    'label' => "{$offering->subject->codigo_institucional} · {$offering->subject->nombre}",
                    'period_name' => $offering->academicPeriod->nombre,
                    'campus_name' => $offering->campus->nombre,
                    'modality_name' => $offering->modality->nombre,
                    'parallel_count' => $offering->parallels_count,
                    'active' => $offering->activo,
                    'editable' => ! $usedOfferingIds->has($offering->id),
                ]),
            'parallels' => $parallels
                ->map(fn (Parallel $parallel) => [
                    'id' => $parallel->id,
                    'offering_id' => $parallel->oferta_academica_id,
                    'code' => $parallel->codigo,
                    'active' => $parallel->activo,
                    'offering_label' => "{$parallel->offering->subject->codigo_institucional} · {$parallel->offering->academicPeriod->nombre}",
                    'editable' => ! $usedParallelIds->has($parallel->id),
                ]),
            'options' => [
                ...$this->emptyOptions(),
                'periods' => AcademicPeriod::query()
                    ->where('activo', true)
                    ->where(fn ($query) => $query
                        ->whereNull('carrera_id')
                        ->orWhere('carrera_id', $careerId))
                    ->orderByDesc('fecha_inicio')
                    ->get(['id', 'nombre']),
                'campuses' => Campus::query()->where('activo', true)->orderBy('nombre')->get(['id', 'nombre']),
                'modalities' => Modality::query()->where('activo', true)->orderBy('nombre')->get(['id', 'nombre']),
                'publishedSubjects' => Subject::query()
                    ->where('activo', true)
                    ->whereHas('curriculumVersion', fn ($query) => $query
                        ->where('carrera_id', $careerId)
                        ->where('estado', 'published'))
                    ->orderBy('nombre')
                    ->get(['id', 'codigo_institucional', 'nombre']),
                'offerings' => CourseOffering::query()
                    ->where('activo', true)
                    ->whereHas('subject.curriculumVersion', fn ($query) => $query->where('carrera_id', $careerId))
                    ->with(['subject:id,codigo_institucional,nombre', 'academicPeriod:id,nombre'])
                    ->get()
                    ->map(fn (CourseOffering $offering) => [
                        'id' => $offering->id,
                        'label' => "{$offering->subject->codigo_institucional} · {$offering->academicPeriod->nombre}",
                    ]),
            ],
        ];
    }

    /** @return array<string, mixed> */
    public function teacherAssignments(string $careerId): array
    {
        $career = $this->career($careerId);
        $teacherAssignments = TeacherAssignment::query()
            ->whereHas(
                'parallel.offering.subject.curriculumVersion',
                fn ($query) => $query->where('carrera_id', $careerId),
            )
            ->with([
                'user:id,name,email',
                'parallel.offering.subject:id,nombre,codigo_institucional',
                'parallel.offering.academicPeriod:id,nombre',
            ])
            ->orderByDesc('vigente_desde')
            ->get();
        $usedAssignmentIds = SyllabusCollaborator::query()
            ->whereIn('asignacion_docente_id', $teacherAssignments->pluck('id'))
            ->pluck('asignacion_docente_id')
            ->flip();

        return [
            'career' => ['id' => $career->id, 'name' => $career->nombre],
            'teacherAssignments' => $teacherAssignments
                ->map(fn (TeacherAssignment $assignment) => [
                    'id' => $assignment->id,
                    'user_id' => $assignment->user->id,
                    'parallel_id' => $assignment->paralelo_id,
                    'user_name' => $assignment->user->name,
                    'user_email' => $assignment->user->email,
                    'parallel_code' => $assignment->parallel->codigo,
                    'subject_name' => $assignment->parallel->offering->subject->nombre,
                    'period_name' => $assignment->parallel->offering->academicPeriod->nombre,
                    'valid_from' => $assignment->vigente_desde->toDateString(),
                    'valid_until' => $assignment->vigente_hasta?->toDateString(),
                    'active' => $assignment->activo,
                    'editable' => ! $usedAssignmentIds->has($assignment->id),
                ]),
            'options' => [
                ...$this->emptyOptions(),
                'parallels' => Parallel::query()
                    ->where('activo', true)
                    ->whereHas(
                        'offering.subject.curriculumVersion',
                        fn ($query) => $query->where('carrera_id', $careerId),
                    )
                    ->with(['offering.subject:id,codigo_institucional,nombre', 'offering.academicPeriod:id,nombre'])
                    ->get()
                    ->map(fn (Parallel $parallel) => [
                        'id' => $parallel->id,
                        'label' => "{$parallel->offering->subject->codigo_institucional} · {$parallel->offering->academicPeriod->nombre} · Paralelo {$parallel->codigo}",
                    ]),
                'teacherUsers' => User::query()
                    ->where('active', true)
                    ->whereIn('id', RoleAssignment::query()
                        ->select('usuario_id')
                        ->effective()
                        ->where('carrera_id', $careerId)
                        ->whereHas('role', fn ($query) => $query->where('codigo', RoleCode::Teacher->value)))
                    ->orderBy('name')
                    ->get(['id', 'name', 'email']),
            ],
        ];
    }

    private function career(string $careerId): Career
    {
        return Career::query()->where('activo', true)->findOrFail($careerId);
    }

    /** @return array<string, array<never, never>> */
    private function emptyOptions(): array
    {
        return [
            'faculties' => [],
            'careers' => [],
            'periods' => [],
            'campuses' => [],
            'modalities' => [],
            'draftCurricula' => [],
            'publishedSubjects' => [],
            'offerings' => [],
            'parallels' => [],
            'coordinatorUsers' => [],
            'teacherUsers' => [],
        ];
    }
}
