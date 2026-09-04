<?php

namespace App\Modules\Syllabus\Presentation\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\AcademicPeriod;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
use App\Modules\Syllabus\Application\Actions\CreateSyllabusProcess;
use App\Modules\Syllabus\Application\Actions\ExtendProcessDeadline;
use App\Modules\Syllabus\Application\Actions\TransitionSyllabusProcess;
use App\Modules\Syllabus\Application\Actions\UpdateSyllabusProcess;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusProcess;
use App\Modules\Syllabus\Presentation\Http\Requests\ExtendProcessDeadlineRequest;
use App\Modules\Syllabus\Presentation\Http\Requests\ManageSyllabusProcessesRequest;
use App\Modules\Syllabus\Presentation\Http\Requests\StoreSyllabusProcessRequest;
use App\Modules\Syllabus\Presentation\Http\Requests\TransitionSyllabusProcessRequest;
use App\Modules\Syllabus\Presentation\Http\Requests\UpdateSyllabusProcessRequest;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class SyllabusProcessController extends Controller
{
    public function index(ManageSyllabusProcessesRequest $request): Response
    {
        $activeProcess = SyllabusProcess::query()->inProgress()
            ->with('academicPeriod:id,nombre')
            ->first(['id', 'nombre', 'periodo_academico_id', 'estado']);

        return Inertia::render('Admin/Processes/Index', [
            'processes' => SyllabusProcess::query()
                ->with(['template:id,nombre', 'academicPeriod:id,nombre'])
                ->withCount('convocations')
                ->orderByDesc('creado_en')
                ->get()
                ->map(fn (SyllabusProcess $process): array => [
                    'id' => $process->id,
                    'name' => $process->nombre,
                    'state' => $process->estado,
                    'template' => $process->template->nombre,
                    'period_id' => $process->periodo_academico_id,
                    'period_name' => $process->academicPeriod->nombre,
                    'starts_at' => $process->inicia_en->toIso8601String(),
                    'due_at' => $process->entrega_en->toIso8601String(),
                    'convocations_count' => $process->convocations_count,
                    'configurable' => $process->isConfigurable(),
                ]),
            // La plantilla es una sola: se informa cuál es, no se elige.
            'template' => SyllabusTemplate::query()
                ->where('es_institucional', true)
                ->where('activo', true)
                ->value('nombre'),
            'periods' => AcademicPeriod::query()
                ->where('activo', true)
                ->orderByDesc('fecha_inicio')
                ->get(['id', 'nombre']),
            'active_process' => $activeProcess === null ? null : [
                'name' => $activeProcess->nombre,
                'period' => $activeProcess->academicPeriod->nombre,
                'state' => $activeProcess->estado,
            ],
        ]);
    }

    public function store(StoreSyllabusProcessRequest $request, CreateSyllabusProcess $action): RedirectResponse
    {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($request->processData(), $actor, $request);

        return back()->with('success', 'Proceso preparado. Ábralo cuando el calendario institucional lo indique.');
    }

    public function update(
        SyllabusProcess $process,
        UpdateSyllabusProcessRequest $request,
        UpdateSyllabusProcess $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($process, $request->processData(), $actor, $request);

        return back()->with('success', 'Proceso actualizado. Las convocatorias que se abran desde ahora toman esta configuración.');
    }

    public function extendDeadline(
        SyllabusProcess $process,
        ExtendProcessDeadlineRequest $request,
        ExtendProcessDeadline $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute(
            $process,
            $request->string('stage')->toString(),
            $request->string('due_at')->toString(),
            $request->string('reason')->toString(),
            $actor,
            $request,
        );

        return back()->with('success', 'Plazo prorrogado para todas las convocatorias del proceso. El motivo queda registrado en auditoría.');
    }

    public function transition(
        SyllabusProcess $process,
        string $transition,
        TransitionSyllabusProcessRequest $request,
        TransitionSyllabusProcess $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $reason = $request->filled('reason') ? $request->string('reason')->toString() : null;
        $action->execute($process, $transition, $reason, $actor, $request);

        return back()->with('success', match ($transition) {
            TransitionSyllabusProcess::OPEN => 'Proceso abierto. Las coordinaciones ya pueden abrir sus convocatorias.',
            TransitionSyllabusProcess::PAUSE => 'Proceso en pausa. Los envíos se detienen y la plantilla queda editable.',
            TransitionSyllabusProcess::RESUME => 'Proceso reanudado. Los envíos vuelven a admitirse.',
            default => 'Proceso cerrado.',
        });
    }
}
