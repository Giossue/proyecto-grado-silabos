<?php

namespace App\Modules\Configuration\Presentation\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Configuration\Application\Actions\CreateAcademicSource;
use App\Modules\Configuration\Application\Actions\UpdateAcademicSource;
use App\Modules\Configuration\Application\Actions\UpdateAcademicSourceContent;
use App\Modules\Configuration\Infrastructure\Persistence\Models\AcademicSource;
use App\Modules\Configuration\Presentation\Http\Requests\CreateSourceRequest;
use App\Modules\Configuration\Presentation\Http\Requests\ManageAcademicSourceRequest;
use App\Modules\Configuration\Presentation\Http\Requests\UpdateSourceContentRequest;
use App\Modules\Configuration\Presentation\Http\Requests\UpdateSourceRequest;
use App\Modules\Configuration\Presentation\Http\Requests\ViewSourcesRequest;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Syllabus\Application\ProcessLocks;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class AcademicSourceController extends Controller
{
    public function index(ViewSourcesRequest $request, ActiveRole $roles, ProcessLocks $locks): Response
    {
        $activeRole = $roles->resolve($request);

        return Inertia::render('Sources/Index', [
            'processLock' => $locks->careerLockReason($activeRole?->carrera_id),
            'sources' => AcademicSource::query()
                ->where('carrera_id', $activeRole?->carrera_id)
                ->orderBy('nombre')
                ->get()
                ->map(fn (AcademicSource $source) => [
                    'id' => $source->id,
                    'name' => $source->nombre,
                    'description' => $source->descripcion,
                    'internal_notes' => $source->notas_internas,
                    'has_content' => is_string($source->contenido) && trim($source->contenido) !== '',
                    'actualizado_en' => $source->actualizado_en?->toDateString(),
                ]),
        ]);
    }

    public function store(CreateSourceRequest $request, CreateAcademicSource $action): RedirectResponse
    {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $source = $action->execute($request->validated(), $actor, $request);

        return to_route('sources.show', $source)->with('success', 'Fuente creada. Ya puede redactar su contenido.');
    }

    public function show(AcademicSource $source, ManageAcademicSourceRequest $request, ProcessLocks $locks): Response
    {
        return Inertia::render('Sources/Show', [
            'processLock' => $locks->careerLockReason($source->carrera_id),
            'source' => [
                'id' => $source->id,
                'name' => $source->nombre,
                'description' => $source->descripcion,
                'internal_notes' => $source->notas_internas,
                'content' => $source->contenido,
                'actualizado_en' => $source->actualizado_en?->toDateString(),
            ],
        ]);
    }

    public function update(
        AcademicSource $source,
        UpdateSourceRequest $request,
        UpdateAcademicSource $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($source, $request->validated(), $actor, $request);

        return back()->with('success', 'Fuente actualizada.');
    }

    public function updateContent(
        AcademicSource $source,
        UpdateSourceContentRequest $request,
        UpdateAcademicSourceContent $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $content = $request->validated('content');
        $action->execute($source, is_string($content) ? $content : null, $actor, $request);

        return back()->with('success', 'Contenido guardado.');
    }
}
