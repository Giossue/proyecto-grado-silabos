<?php

namespace App\Modules\Syllabus\Presentation\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\AcademicSource;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Syllabus\Application\Actions\CreateConvocation;
use App\Modules\Syllabus\Application\Actions\OpenConvocation;
use App\Modules\Syllabus\Application\Actions\TransitionConvocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusProcess;
use App\Modules\Syllabus\Presentation\Http\Requests\OpenConvocationRequest;
use App\Modules\Syllabus\Presentation\Http\Requests\StoreConvocationRequest;
use App\Modules\Syllabus\Presentation\Http\Requests\TransitionConvocationRequest;
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
        $state = in_array($filters['state'] ?? null, ['sin_iniciar', 'preparacion', 'abierta', 'pausada', 'cerrada'], true)
            ? $filters['state']
            : null;

        return Inertia::render('Coordination/Convocations/Index', [
            'filters' => ['q' => $search ?: null, 'state' => $state],
            'convocations' => SyllabusProcess::query()
                // La convocatoria se identifica por el período institucional que abarca.
                ->when($search, fn ($query, string $term) => $query->where(
                    fn ($outer) => $outer->whereHas('academicPeriod', fn ($period) => $period
                        ->whereRaw('nombre ILIKE ?', ["%{$term}%"])),
                ))
                ->when($state, function ($query, string $value) use ($careerId): void {
                    if ($value === 'sin_iniciar') {
                        $query->whereDoesntHave('convocations', fn ($career) => $career->where('carrera_id', $careerId));
                    } else {
                        $query->whereHas('convocations', fn ($career) => $career->where('carrera_id', $careerId)->where('estado', $value));
                    }
                })
                ->with([
                    'academicPeriod:id,nombre', 'template:id,nombre',
                    'convocations' => fn ($career) => $career->where('carrera_id', $careerId)->withCount('syllabi'),
                ])
                ->orderByDesc('creado_en')
                ->paginate(15)
                ->withQueryString()
                ->through(function (SyllabusProcess $process): array {
                    $convocation = $process->convocations->first();

                    return [
                        'id' => $convocation?->id,
                        'process_id' => $process->id,
                        'name' => $process->nombre,
                        'state' => $convocation->estado ?? 'sin_iniciar',
                        'process_state' => $process->estado,
                        'period' => $process->academicPeriod->nombre,
                        'template' => $process->template->nombre,
                        'syllabi_count' => $convocation->syllabi_count ?? 0,
                    ];
                }),
        ]);
    }

    public function store(StoreConvocationRequest $request, CreateConvocation $action): RedirectResponse
    {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $convocation = $action->execute($request->convocationData(), $actor, $request);

        return to_route('convocations.show', $convocation)->with('success', 'Convocatoria iniciada: se generó un sílabo por cada paralelo.');
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

        return back()->with('success', $transition === TransitionConvocation::PAUSE
            ? 'Convocatoria en pausa. Los docentes de la carrera no editan ni envían; la malla y las fuentes quedan editables.'
            : 'Convocatoria reanudada. Los docentes vuelven a trabajar y la malla y las fuentes quedan protegidas.');
    }
}
