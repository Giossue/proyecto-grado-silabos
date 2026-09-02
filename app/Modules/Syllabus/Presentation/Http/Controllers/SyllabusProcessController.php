<?php

namespace App\Modules\Syllabus\Presentation\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateVersion;
use App\Modules\Syllabus\Application\Actions\CreateSyllabusProcess;
use App\Modules\Syllabus\Application\Actions\TransitionSyllabusProcess;
use App\Modules\Syllabus\Application\Actions\UpdateSyllabusProcess;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusProcess;
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
        return Inertia::render('Admin/Processes/Index', [
            'processes' => SyllabusProcess::query()
                ->with('templateVersion.template:id,nombre')
                ->withCount('convocations')
                ->orderByDesc('creado_en')
                ->get()
                ->map(fn (SyllabusProcess $process): array => [
                    'id' => $process->id,
                    'name' => $process->nombre,
                    'state' => $process->estado,
                    'template_version_id' => $process->version_plantilla_id,
                    'template' => "{$process->templateVersion->template->nombre} · v{$process->templateVersion->numero_version}",
                    'starts_at' => $process->inicia_en->toIso8601String(),
                    'due_at' => $process->entrega_en->toIso8601String(),
                    'convocations_count' => $process->convocations_count,
                    'configurable' => $process->isConfigurable(),
                ]),
            'templates' => TemplateVersion::query()
                ->where('estado', 'publicada')
                ->whereHas('template', fn ($query) => $query->where('es_institucional', true)->where('activo', true))
                ->with('template:id,nombre')
                ->orderByDesc('publicado_en')->get()
                ->map(fn (TemplateVersion $version) => ['id' => $version->id, 'label' => "{$version->template->nombre} · v{$version->numero_version}"]),
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
