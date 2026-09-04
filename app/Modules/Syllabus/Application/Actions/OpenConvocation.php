<?php

namespace App\Modules\Syllabus\Application\Actions;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\CourseOffering;
use App\Modules\Academic\Infrastructure\Persistence\Models\Curriculum;
use App\Modules\Academic\Infrastructure\Persistence\Models\Parallel;
use App\Modules\Academic\Infrastructure\Persistence\Models\TeacherAssignment;
use App\Modules\Configuration\Application\TemplateStructureValidator;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\AcademicContextSnapshot;
use App\Modules\Syllabus\Application\InheritMasterValues;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusCollaborator;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusProcess;
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
        private readonly TemplateStructureValidator $templateStructure,
        private readonly InheritMasterValues $inherit,
    ) {}

    public function execute(string $convocationId, User $actor, Request $request): Convocation
    {
        $activeRole = $this->roles->resolve($request);

        return DB::transaction(function () use ($actor, $convocationId, $activeRole, $request): Convocation {
            $convocation = Convocation::query()->lockForUpdate()->with(['sources', 'template.sections.blocks.fields', 'process'])->findOrFail($convocationId);
            if ($activeRole?->carrera_id !== $convocation->carrera_id || $activeRole->role->codigo !== 'coordinador') {
                abort(403);
            }
            if ($convocation->estado !== 'preparacion') {
                throw ValidationException::withMessages(['convocation' => 'Solo una convocatoria en preparación puede abrirse.']);
            }
            // El calendario lo marca Administración: sin proceso abierto no hay a qué convocar.
            if ($convocation->process->estado !== SyllabusProcess::STATE_OPEN) {
                throw ValidationException::withMessages(['convocation' => match ($convocation->process->estado) {
                    SyllabusProcess::STATE_PAUSED => 'El proceso institucional está en pausa. Podrá abrir cuando Administración lo reanude.',
                    SyllabusProcess::STATE_CLOSED => 'El proceso institucional ya se cerró. Prepare la convocatoria sobre un proceso vigente.',
                    default => 'El proceso institucional todavía no se abre. Podrá abrir cuando Administración lo inicie.',
                }]);
            }
            if (! $convocation->template->activo) {
                throw ValidationException::withMessages(['convocation' => 'La plantilla institucional está inactiva.']);
            }
            $this->templateStructure->assertUsable($convocation->template, 'convocation');
            if ($convocation->sources->isEmpty()
                || $convocation->sources->contains(fn ($source): bool => ! $source->activo)) {
                throw ValidationException::withMessages(['convocation' => 'Las fuentes fijadas deben continuar activas al abrir.']);
            }

            if (! Curriculum::query()
                ->where('carrera_id', $convocation->carrera_id)
                ->active()
                ->exists()) {
                throw ValidationException::withMessages([
                    'convocation' => 'La carrera no tiene una malla activa. Actívela antes de abrir nuevos procesos para docentes.',
                ]);
            }

            $offerings = CourseOffering::query()
                ->where('periodo_academico_id', $convocation->periodo_academico_id)
                ->where('activo', true)
                ->whereHas('subject.curriculum', fn ($query) => $query
                    ->where('carrera_id', $convocation->carrera_id)
                    ->where('estado', 'activa'))
                ->with([
                    'subject.curriculum', 'campus',
                    'parallels' => fn ($query) => $query->where('activo', true)->lockForUpdate()->with([
                        'teacherAssignments' => fn ($assignmentQuery) => $assignmentQuery
                            ->where('activo', true)
                            ->whereHas('user', fn ($userQuery) => $userQuery->where('activo', true)->laborallyEffective())
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
                if ($convocation->modo_agrupacion === 'por_paralelo') {
                    foreach ($offering->parallels as $parallel) {
                        $this->generateSyllabus($convocation, $offering, new Collection([$parallel]));
                        $generated++;
                    }

                    continue;
                }

                $this->generateSyllabus($convocation, $offering, $offering->parallels);
                $generated++;
            }

            $convocation->update(['estado' => 'abierta', 'abierto_por' => $actor->id, 'abierto_en' => now()]);
            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole->id,
                action: 'convocatoria.abierta',
                resourceType: 'convocatoria',
                resourceId: $convocation->id,
                result: 'exito',
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
            'malla_id' => $offering->subject->malla_id,
            'plantilla_id' => $convocation->plantilla_id,
            'contexto_academico' => $this->academicContext->build($offering),
            'estado' => 'sin_iniciar',
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
        $this->inherit->execute($syllabus, $convocation->template->sections->flatMap(fn ($section) => $section->blocks->flatMap(fn ($block) => $block->fields)), $offering);
    }
}
