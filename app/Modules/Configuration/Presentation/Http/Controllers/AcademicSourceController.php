<?php

namespace App\Modules\Configuration\Presentation\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Configuration\Application\Actions\ActivateSourceVersion;
use App\Modules\Configuration\Application\Actions\AddSourceFragment;
use App\Modules\Configuration\Application\Actions\CloneSourceVersion;
use App\Modules\Configuration\Application\Actions\CreateAcademicSource;
use App\Modules\Configuration\Application\Actions\ResolveSourceConflict;
use App\Modules\Configuration\Infrastructure\Persistence\Models\AcademicSource;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SourceConflict;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SourceFragment;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SourceVersion;
use App\Modules\Configuration\Presentation\Http\Requests\AddSourceFragmentRequest;
use App\Modules\Configuration\Presentation\Http\Requests\CreateSourceRequest;
use App\Modules\Configuration\Presentation\Http\Requests\ManageAcademicSourceRequest;
use App\Modules\Configuration\Presentation\Http\Requests\ManageSourceVersionRequest;
use App\Modules\Configuration\Presentation\Http\Requests\ResolveSourceConflictRequest;
use App\Modules\Configuration\Presentation\Http\Requests\ViewSourcesRequest;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class AcademicSourceController extends Controller
{
    public function index(ViewSourcesRequest $request, ActiveRole $roles): Response
    {
        $activeRole = $roles->resolve($request);
        $query = AcademicSource::query()
            ->with('career:id,nombre')
            ->with(['versions' => fn ($query) => $query->orderByDesc('numero_version')]);

        if ($activeRole?->role->codigo === RoleCode::Coordinator->value) {
            $query->where('carrera_id', $activeRole->carrera_id);
        }

        return Inertia::render('Sources/Index', [
            'sources' => $query->orderBy('nombre')->get()->map(fn (AcademicSource $source) => [
                'id' => $source->id,
                'name' => $source->nombre,
                'type' => $source->tipo,
                'authority' => $source->autoridad,
                'responsible' => $source->responsable,
                'career_name' => $source->career->nombre,
                'active' => $source->activo,
                'versions' => $source->versions->map(fn (SourceVersion $version) => [
                    'id' => $version->id,
                    'number' => $version->numero_version,
                    'state' => $version->estado,
                    'valid_from' => $version->vigente_desde?->toDateString(),
                    'valid_until' => $version->vigente_hasta?->toDateString(),
                ])->values()->all(),
            ]),
            'careers' => Career::query()->where('activo', true)->orderBy('nombre')->get(['id', 'nombre']),
            'isAdministrator' => $activeRole?->role->codigo === RoleCode::Administrator->value,
        ]);
    }

    public function store(CreateSourceRequest $request, CreateAcademicSource $action): RedirectResponse
    {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $version = $action->execute($request->validated(), $actor, $request);

        return to_route('sources.show', $version->source)->with('success', 'Fuente y primera versión en borrador creadas.');
    }

    public function show(AcademicSource $source, ManageAcademicSourceRequest $request): Response
    {
        $source->load(['career:id,nombre', 'versions' => fn ($query) => $query->orderByDesc('numero_version')]);
        $selected = $source->versions->firstWhere('id', $request->query('version')) ?? $source->versions->first();
        abort_unless($selected instanceof SourceVersion, 404);
        $selected->load('fragments');
        $conflicts = SourceConflict::query()
            ->where('version_candidata_id', $selected->id)
            ->with(['activeVersion.source:id,nombre'])
            ->orderByDesc('created_at')
            ->get();

        return Inertia::render('Sources/Show', [
            'source' => [
                'id' => $source->id,
                'name' => $source->nombre,
                'type' => $source->tipo,
                'authority' => $source->autoridad,
                'responsible' => $source->responsable,
                'description' => $source->descripcion,
                'career_name' => $source->career->nombre,
                'versions' => $source->versions->map(fn (SourceVersion $version) => [
                    'id' => $version->id,
                    'number' => $version->numero_version,
                    'state' => $version->estado,
                ])->values(),
            ],
            'selectedVersion' => [
                'id' => $selected->id,
                'number' => $selected->numero_version,
                'state' => $selected->estado,
                'valid_from' => $selected->vigente_desde?->toDateString(),
                'valid_until' => $selected->vigente_hasta?->toDateString(),
                'fragments' => $selected->fragments->map(fn (SourceFragment $fragment) => [
                    'id' => $fragment->id,
                    'title' => $fragment->titulo,
                    'content' => $fragment->contenido,
                    'structured_value' => $fragment->valor_estructurado,
                ])->values(),
                'conflicts' => $conflicts->map(fn (SourceConflict $conflict) => [
                    'id' => $conflict->id,
                    'state' => $conflict->estado,
                    'decision' => $conflict->decision,
                    'active_source_name' => $conflict->activeVersion->source->nombre,
                ])->values(),
            ],
        ]);
    }

    public function addFragment(
        SourceVersion $version,
        AddSourceFragmentRequest $request,
        AddSourceFragment $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($version->id, $request->validated(), $actor, $request);

        return back()->with('success', 'Fragmento agregado.');
    }

    public function activate(
        SourceVersion $version,
        ManageSourceVersionRequest $request,
        ActivateSourceVersion $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $result = $action->execute($version->id, $actor, $request);

        if (! $result['activated']) {
            return back()->withErrors([
                'version' => "Se detectaron {$result['conflicts']} contradicciones. Resuélvalas antes de activar.",
            ]);
        }

        return back()->with('success', 'Versión de fuente activada.');
    }

    public function clone(
        SourceVersion $version,
        ManageSourceVersionRequest $request,
        CloneSourceVersion $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $clone = $action->execute($version, $actor, $request);

        return to_route('sources.show', ['source' => $clone->source, 'version' => $clone->id])
            ->with('success', 'Nueva versión en borrador creada.');
    }

    public function resolveConflict(
        SourceConflict $conflict,
        ResolveSourceConflictRequest $request,
        ResolveSourceConflict $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute(
            $conflict,
            $request->string('decision')->toString(),
            $request->string('justification')->toString(),
            $actor,
            $request,
        );

        return back()->with('success', 'Conflicto resuelto por decisión humana y auditado.');
    }
}
