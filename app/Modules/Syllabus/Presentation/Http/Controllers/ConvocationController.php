<?php

namespace App\Modules\Syllabus\Presentation\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\AcademicPeriod;
use App\Modules\Configuration\Infrastructure\Persistence\Models\AcademicSource;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Syllabus\Application\Actions\CreateConvocation;
use App\Modules\Syllabus\Application\Actions\OpenConvocation;
use App\Modules\Syllabus\Application\Actions\TransitionConvocation;
use App\Modules\Syllabus\Application\Actions\UpdateConvocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusProcess;
use App\Modules\Syllabus\Presentation\Http\Requests\OpenConvocationRequest;
use App\Modules\Syllabus\Presentation\Http\Requests\StoreConvocationRequest;
use App\Modules\Syllabus\Presentation\Http\Requests\TransitionConvocationRequest;
use App\Modules\Syllabus\Presentation\Http\Requests\UpdateConvocationRequest;
use App\Modules\Syllabus\Presentation\Http\Requests\ViewConvocationsRequest;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ConvocationController extends Controller
{
    public function index(ViewConvocationsRequest $request, ActiveRole $roles): Response
    {
        $careerId = $roles->resolve($request)?->carrera_id;
        $filters = $request->validated();
        $search = is_string($filters['q'] ?? null) ? trim($filters['q']) : null;
        $state = in_array($filters['state'] ?? null, ['preparacion', 'abierta', 'pausada', 'cerrada'], true)
            ? $filters['state']
            : null;

        return Inertia::render('Coordination/Convocations/Index', [
            'filters' => ['q' => $search ?: null, 'state' => $state],
            'convocations' => Convocation::query()
                ->where('carrera_id', $careerId)
                // Una convocatoria se recuerda por su nombre o por el periodo que abarca.
                ->when($search, fn ($query, string $term) => $query->where(
                    fn ($outer) => $outer
                        ->whereRaw('nombre ILIKE ?', ["%{$term}%"])
                        ->orWhereHas('academicPeriod', fn ($period) => $period
                            ->whereRaw('nombre ILIKE ?', ["%{$term}%"])),
                ))
                ->when($state, fn ($query, string $value) => $query->where('estado', $value))
                ->with(['academicPeriod:id,nombre', 'template:id,nombre', 'process:id,nombre,estado', 'sources:id'])
                ->withCount('syllabi')
                ->orderByDesc('creado_en')
                ->paginate(15)
                ->through(fn (Convocation $convocation) => [
                    'id' => $convocation->id,
                    'name' => $convocation->nombre,
                    'state' => $convocation->estado,
                    'process' => $convocation->process->nombre,
                    'process_state' => $convocation->process->estado,
                    'grouping_mode' => $convocation->modo_agrupacion,
                    'period' => $convocation->academicPeriod->nombre,
                    'period_id' => $convocation->periodo_academico_id,
                    'source_ids' => $convocation->sources->pluck('id')->values(),
                    'template' => $convocation->template->nombre,
                    'syllabi_count' => $convocation->syllabi_count,
                ]),
            'periods' => AcademicPeriod::query()->where('activo', true)->orderByDesc('fecha_inicio')->get(['id', 'nombre']),
            // El calendario lo fija Administración: la carrera elige a qué proceso
            // convoca y hereda su plantilla y sus fechas.
            'processes' => SyllabusProcess::query()
                ->whereNot('estado', SyllabusProcess::STATE_CLOSED)
                ->with('template:id,nombre')
                ->orderByDesc('inicia_en')->get()
                ->map(fn (SyllabusProcess $process): array => [
                    'id' => $process->id,
                    'label' => $process->nombre,
                    'state' => $process->estado,
                    'template' => $process->template->nombre,
                    'starts_at' => $process->inicia_en->toIso8601String(),
                    'due_at' => $process->entrega_en->toIso8601String(),
                ]),
            'sources' => AcademicSource::query()
                ->where('carrera_id', $careerId)
                ->where('activo', true)
                ->orderBy('nombre')->get()
                ->map(fn (AcademicSource $source) => ['id' => $source->id, 'label' => $source->nombre]),
        ]);
    }

    public function store(StoreConvocationRequest $request, CreateConvocation $action): RedirectResponse
    {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $convocation = $action->execute($request->convocationData(), $actor, $request);

        return to_route('convocations.show', $convocation)->with('success', 'Convocatoria preparada. Revisa el alcance antes de abrirla.');
    }

    public function show(Convocation $convocation, Request $request): Response
    {
        abort_unless($request->user()?->can('view', $convocation) === true, 403);
        $convocation->load(['academicPeriod', 'template', 'sources', 'deadlines', 'process']);
        $syllabi = $convocation->syllabi()
            ->with(['subject:id,nombre,codigo_institucional', 'scopes.parallel:id,codigo', 'teachers:id,nombre'])
            ->orderBy('asignatura_id')->get();

        return Inertia::render('Coordination/Convocations/Show', [
            'convocation' => [
                'id' => $convocation->id,
                'name' => $convocation->nombre,
                'state' => $convocation->estado,
                'process' => [
                    'name' => $convocation->process->nombre,
                    'state' => $convocation->process->estado,
                ],
                'grouping_mode' => $convocation->modo_agrupacion,
                'period' => $convocation->academicPeriod->nombre,
                'template' => $convocation->template->nombre,
                'sources' => $convocation->sources->map(fn (AcademicSource $source) => $source->nombre)->values(),
                'start_date' => $convocation->deadlines->firstWhere('etapa', 'inicio')?->vence_en->toIso8601String(),
                'draft_deadline' => $convocation->deadlines->firstWhere('etapa', 'borrador')?->vence_en->toIso8601String(),
                'counts' => [
                    'total' => $syllabi->count(),
                    'not_started' => $syllabi->where('estado', 'sin_iniciar')->count(),
                    'draft' => $syllabi->where('estado', 'borrador')->count(),
                    'in_review' => $syllabi->where('estado', 'en_revision')->count(),
                    'approved' => $syllabi->where('estado', 'aprobado')->count(),
                ],
                'syllabi' => $syllabi->map(fn (Syllabus $syllabus) => [
                    'id' => $syllabus->id,
                    'subject' => $syllabus->academicSubjectName(),
                    'code' => $syllabus->academicSubjectCode(),
                    'state' => $syllabus->estado,
                    'completion' => (float) $syllabus->porcentaje_completitud,
                    'parallels' => $syllabus->scopes->pluck('parallel.codigo')->unique()->values(),
                    'teachers' => $syllabus->teachers->pluck('nombre')->unique()->values(),
                ])->values(),
            ],
        ]);
    }

    public function open(Convocation $convocation, OpenConvocationRequest $request, OpenConvocation $action): RedirectResponse
    {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($convocation->id, $actor, $request);

        return back()->with('success', 'Convocatoria abierta y expedientes generados sin duplicados.');
    }

    public function update(
        Convocation $convocation,
        UpdateConvocationRequest $request,
        UpdateConvocation $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($convocation, $request->convocationData(), $actor, $request);

        return back()->with('success', 'Convocatoria actualizada.');
    }

    public function transition(
        Convocation $convocation,
        string $transition,
        TransitionConvocationRequest $request,
        TransitionConvocation $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $reason = $request->filled('reason') ? $request->string('reason')->toString() : null;
        $action->execute($convocation, $transition, $reason, $actor, $request);

        return back()->with('success', match ($transition) {
            TransitionConvocation::PAUSE => 'Convocatoria en pausa. Los docentes de la carrera no editan ni envían; la malla y las fuentes quedan editables.',
            TransitionConvocation::RESUME => 'Convocatoria reanudada. Los docentes vuelven a trabajar y la malla y las fuentes quedan protegidas.',
            default => 'Convocatoria cerrada. Los expedientes se conservan y ya no admiten envíos.',
        });
    }
}
