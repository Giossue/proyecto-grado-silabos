<?php

namespace App\Modules\Syllabus\Presentation\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\AcademicPeriod;
use App\Modules\Configuration\Infrastructure\Persistence\Models\AcademicSource;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateVersion;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Syllabus\Application\Actions\CreateConvocation;
use App\Modules\Syllabus\Application\Actions\ExtendConvocationDeadline;
use App\Modules\Syllabus\Application\Actions\OpenConvocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Modules\Syllabus\Presentation\Http\Requests\ExtendConvocationDeadlineRequest;
use App\Modules\Syllabus\Presentation\Http\Requests\OpenConvocationRequest;
use App\Modules\Syllabus\Presentation\Http\Requests\StoreConvocationRequest;
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
        $state = in_array($filters['state'] ?? null, ['preparation', 'open', 'closed'], true)
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
                ->with(['academicPeriod:id,nombre', 'templateVersion.template:id,nombre'])
                ->withCount('syllabi')
                ->orderByDesc('created_at')
                ->paginate(15)
                ->through(fn (Convocation $convocation) => [
                    'id' => $convocation->id,
                    'name' => $convocation->nombre,
                    'state' => $convocation->estado,
                    'grouping_mode' => $convocation->modo_agrupacion,
                    'period' => $convocation->academicPeriod->nombre,
                    'template' => $convocation->templateVersion->template->nombre,
                    'syllabi_count' => $convocation->syllabi_count,
                ]),
            'periods' => AcademicPeriod::query()->where('activo', true)->orderByDesc('fecha_inicio')->get(['id', 'nombre']),
            'templates' => TemplateVersion::query()
                ->where('estado', 'published')
                ->whereHas('template', fn ($query) => $query->where('es_institucional', true)->where('activo', true))
                ->with('template:id,nombre')
                ->orderByDesc('publicado_en')->get()
                ->map(fn (TemplateVersion $version) => ['id' => $version->id, 'label' => "{$version->template->nombre} · v{$version->numero_version}"]),
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
        $convocation->load(['academicPeriod', 'templateVersion.template', 'sources', 'deadlines']);
        $syllabi = $convocation->syllabi()
            ->with(['subject:id,nombre,codigo_institucional', 'scopes.parallel:id,codigo', 'teachers:id,name'])
            ->orderBy('asignatura_id')->get();

        return Inertia::render('Coordination/Convocations/Show', [
            'convocation' => [
                'id' => $convocation->id,
                'name' => $convocation->nombre,
                'state' => $convocation->estado,
                'grouping_mode' => $convocation->modo_agrupacion,
                'period' => $convocation->academicPeriod->nombre,
                'template' => "{$convocation->templateVersion->template->nombre} · v{$convocation->templateVersion->numero_version}",
                'sources' => $convocation->sources->map(fn (AcademicSource $source) => $source->nombre)->values(),
                'start_date' => $convocation->deadlines->firstWhere('etapa', 'start')?->vence_en->toIso8601String(),
                'draft_deadline' => $convocation->deadlines->firstWhere('etapa', 'draft')?->vence_en->toIso8601String(),
                'counts' => [
                    'total' => $syllabi->count(),
                    'not_started' => $syllabi->where('estado', 'not_started')->count(),
                    'draft' => $syllabi->where('estado', 'draft')->count(),
                    'in_review' => $syllabi->where('estado', 'in_review')->count(),
                    'approved' => $syllabi->where('estado', 'approved')->count(),
                ],
                'syllabi' => $syllabi->map(fn (Syllabus $syllabus) => [
                    'id' => $syllabus->id,
                    'subject' => $syllabus->academicSubjectName(),
                    'code' => $syllabus->academicSubjectCode(),
                    'state' => $syllabus->estado,
                    'completion' => (float) $syllabus->porcentaje_completitud,
                    'parallels' => $syllabus->scopes->pluck('parallel.codigo')->unique()->values(),
                    'teachers' => $syllabus->teachers->pluck('name')->unique()->values(),
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

    public function extendDeadline(
        Convocation $convocation,
        ExtendConvocationDeadlineRequest $request,
        ExtendConvocationDeadline $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute(
            $convocation,
            $request->string('stage')->toString(),
            $request->string('due_at')->toString(),
            $request->string('reason')->toString(),
            $actor,
            $request,
        );

        return back()->with('success', 'Plazo prorrogado. El motivo queda registrado en auditoría.');
    }
}
