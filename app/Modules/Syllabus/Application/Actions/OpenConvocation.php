<?php

namespace App\Modules\Syllabus\Application\Actions;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\CourseOffering;
use App\Modules\Academic\Infrastructure\Persistence\Models\CurriculumVersion;
use App\Modules\Academic\Infrastructure\Persistence\Models\Parallel;
use App\Modules\Academic\Infrastructure\Persistence\Models\TeacherAssignment;
use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\AcademicContextSnapshot;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\FieldValue;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusCollaborator;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusScope;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class OpenConvocation
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly AcademicContextSnapshot $academicContext,
    ) {}

    public function execute(string $convocationId, User $actor, Request $request): Convocation
    {
        $activeRole = $this->roles->resolve($request);

        return DB::transaction(function () use ($actor, $convocationId, $activeRole, $request): Convocation {
            $convocation = Convocation::query()->lockForUpdate()->with(['sources', 'templateVersion.fields'])->findOrFail($convocationId);
            if ($activeRole?->carrera_id !== $convocation->carrera_id || $activeRole->role->codigo !== 'coordinator') {
                abort(403);
            }
            if ($convocation->estado !== 'preparation') {
                throw ValidationException::withMessages(['convocation' => 'Solo una convocatoria en preparación puede abrirse.']);
            }
            if ($convocation->templateVersion->estado !== 'published') {
                throw ValidationException::withMessages(['convocation' => 'La plantilla fijada ya no está publicada.']);
            }
            if ($convocation->sources->isEmpty()
                || $convocation->sources->contains(fn ($source): bool => ! $source->activo)) {
                throw ValidationException::withMessages(['convocation' => 'Las fuentes fijadas deben continuar activas al abrir.']);
            }

            if (! CurriculumVersion::query()
                ->where('carrera_id', $convocation->carrera_id)
                ->current()
                ->active()
                ->exists()) {
                throw ValidationException::withMessages([
                    'convocation' => 'La carrera no tiene una malla activa. Actívela antes de abrir nuevos procesos para docentes.',
                ]);
            }

            $offerings = CourseOffering::query()
                ->where('periodo_academico_id', $convocation->periodo_academico_id)
                ->where('activo', true)
                ->whereHas('subject.curriculumVersion', fn ($query) => $query
                    ->where('carrera_id', $convocation->carrera_id)
                    ->where('es_actual', true)
                    ->where('estado', 'active'))
                ->with([
                    'subject.curriculumVersion', 'campus', 'modality',
                    'parallels' => fn ($query) => $query->where('activo', true)->lockForUpdate()->with([
                        'teacherAssignments' => fn ($assignmentQuery) => $assignmentQuery
                            ->where('activo', true)
                            ->where('vigente_desde', '<=', now())
                            ->where(fn ($validity) => $validity->whereNull('vigente_hasta')->orWhere('vigente_hasta', '>', now()))
                            ->whereHas('user', fn ($userQuery) => $userQuery->where('active', true))
                            ->lockForUpdate(),
                    ]),
                ])
                ->orderBy('asignatura_id')
                ->lockForUpdate()
                ->get();

            if ($offerings->isEmpty()) {
                throw ValidationException::withMessages(['convocation' => 'No existen ofertas activas de la carrera para el periodo.']);
            }
            foreach ($offerings as $offering) {
                if ($offering->parallels->isEmpty() || $offering->parallels->contains(
                    fn (Parallel $parallel): bool => $parallel->teacherAssignments->isEmpty(),
                )) {
                    throw ValidationException::withMessages([
                        'convocation' => "La oferta {$offering->subject->nombre} tiene un paralelo sin docente vigente.",
                    ]);
                }
            }

            $generated = 0;
            foreach ($offerings as $offering) {
                if ($convocation->modo_agrupacion === 'per_parallel') {
                    foreach ($offering->parallels as $parallel) {
                        $this->generateSyllabus($convocation, $offering, new Collection([$parallel]));
                        $generated++;
                    }

                    continue;
                }

                $this->generateSyllabus($convocation, $offering, $offering->parallels);
                $generated++;
            }

            $convocation->update(['estado' => 'open', 'abierto_por' => $actor->id, 'abierto_en' => now()]);
            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole->id,
                action: 'convocation.opened',
                resourceType: 'convocation',
                resourceId: $convocation->id,
                result: 'success',
                metadata: ['generated_count' => $generated, 'grouping_mode' => $convocation->modo_agrupacion],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $convocation;
        });
    }

    private function addCollaborator(Syllabus $syllabus, TeacherAssignment $assignment): void
    {
        SyllabusCollaborator::query()->firstOrCreate([
            'silabo_id' => $syllabus->id,
            'asignacion_docente_id' => $assignment->id,
        ], ['usuario_id' => $assignment->usuario_id]);
    }

    /** @param Collection<int, Parallel> $parallels */
    private function generateSyllabus(Convocation $convocation, CourseOffering $offering, Collection $parallels): void
    {
        $syllabus = Syllabus::query()->create([
            'convocatoria_id' => $convocation->id,
            'asignatura_id' => $offering->subject->id,
            'version_malla_id' => $offering->subject->version_malla_id,
            'version_plantilla_id' => $convocation->version_plantilla_id,
            'contexto_academico' => $this->academicContext->build($offering),
            'estado' => 'not_started',
        ]);

        foreach ($parallels as $parallel) {
            SyllabusScope::query()->create([
                'silabo_id' => $syllabus->id,
                'convocatoria_id' => $convocation->id,
                'oferta_academica_id' => $offering->id,
                'paralelo_id' => $parallel->id,
            ]);
            foreach ($parallel->teacherAssignments as $assignment) {
                $this->addCollaborator($syllabus, $assignment);
            }
        }
        $this->inheritMasterValues($syllabus, $convocation->templateVersion->fields, $offering);
    }

    /** @param Collection<int, FieldDefinition> $fields */
    private function inheritMasterValues(Syllabus $syllabus, Collection $fields, CourseOffering $offering): void
    {
        foreach ($fields->where('heredado', true) as $field) {
            $value = match ($field->origen_maestro) {
                'asignaturas' => [
                    'codigo' => $offering->subject->codigo_institucional,
                    'nombre' => $offering->subject->nombre,
                    'ciclo' => $offering->subject->ciclo,
                    'creditos' => $offering->subject->creditos,
                    'horas_totales' => $offering->subject->horas_totales,
                    'campus' => $offering->campus->nombre,
                    'modalidad' => $offering->modality->nombre,
                ],
                'workflow' => ['estado' => 'Sin iniciar'],
                default => null,
            };
            FieldValue::query()->create([
                'silabo_id' => $syllabus->id,
                'definicion_campo_id' => $field->id,
                'valor' => $value,
                'heredado' => true,
                'origen' => $field->origen_maestro,
            ]);
        }
    }
}
