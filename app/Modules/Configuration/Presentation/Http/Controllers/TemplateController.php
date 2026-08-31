<?php

namespace App\Modules\Configuration\Presentation\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Configuration\Application\Actions\CloneTemplateVersion;
use App\Modules\Configuration\Application\Actions\CreateSyllabusTemplate;
use App\Modules\Configuration\Application\Actions\PublishTemplateVersion;
use App\Modules\Configuration\Application\Actions\SaveFieldDefinition;
use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateBlock;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateSection;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateVersion;
use App\Modules\Configuration\Presentation\Http\Requests\CreateTemplateRequest;
use App\Modules\Configuration\Presentation\Http\Requests\ManageTemplatesRequest;
use App\Modules\Configuration\Presentation\Http\Requests\SaveFieldDefinitionRequest;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class TemplateController extends Controller
{
    public function index(ManageTemplatesRequest $request): Response
    {
        return Inertia::render('Admin/Templates/Index', [
            'templates' => SyllabusTemplate::query()
                ->with('career:id,nombre')
                ->with(['versions' => fn ($query) => $query->orderByDesc('numero_version')])
                ->orderBy('nombre')
                ->get()
                ->map(fn (SyllabusTemplate $template) => [
                    'id' => $template->id,
                    'name' => $template->nombre,
                    'description' => $template->descripcion,
                    'career_name' => $template->career?->nombre,
                    'active' => $template->activo,
                    'versions' => $template->versions->map(fn (TemplateVersion $version) => [
                        'id' => $version->id,
                        'number' => $version->numero_version,
                        'state' => $version->estado,
                        'published_at' => $version->publicado_en?->toIso8601String(),
                    ])->values()->all(),
                ]),
            'careers' => Career::query()->where('activo', true)->orderBy('nombre')->get(['id', 'nombre']),
        ]);
    }

    public function store(CreateTemplateRequest $request, CreateSyllabusTemplate $action): RedirectResponse
    {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $version = $action->execute([
            'name' => $request->string('name')->toString(),
            'description' => $request->filled('description') ? $request->string('description')->toString() : null,
            'career_id' => $request->filled('career_id') ? $request->string('career_id')->toString() : null,
        ], $actor, $request);

        return to_route('admin.templates.show', $version)->with('success', 'Plantilla creada con las doce áreas base.');
    }

    public function show(TemplateVersion $version, ManageTemplatesRequest $request): Response
    {
        $version->load(['template.career:id,nombre', 'sections.blocks.fields']);

        return Inertia::render('Admin/Templates/Show', [
            'templateVersion' => [
                'id' => $version->id,
                'number' => $version->numero_version,
                'state' => $version->estado,
                'template' => [
                    'name' => $version->template->nombre,
                    'description' => $version->template->descripcion,
                    'career_name' => $version->template->career?->nombre,
                ],
                'sections' => $version->sections->map(fn (TemplateSection $section) => [
                    'id' => $section->id,
                    'key' => $section->clave,
                    'title' => $section->titulo,
                    'description' => $section->descripcion,
                    'blocks' => $section->blocks->map(fn (TemplateBlock $block) => [
                        'id' => $block->id,
                        'key' => $block->clave,
                        'title' => $block->titulo,
                        'type' => $block->tipo,
                        'fields' => $block->fields->map(fn (FieldDefinition $field) => [
                            'id' => $field->id,
                            'block_id' => $block->id,
                            'key' => $field->clave,
                            'label' => $field->etiqueta,
                            'help' => $field->ayuda,
                            'type' => $field->tipo,
                            'required' => $field->obligatorio,
                            'inherited' => $field->heredado,
                            'master_source' => $field->origen_maestro,
                            'teacher_editable' => $field->editable_docente,
                            'ai_enabled' => $field->ia_habilitada,
                            'document_marker' => $field->marcador_documento,
                        ])->values()->all(),
                    ])->values()->all(),
                ])->values()->all(),
            ],
            'fieldTypes' => [
                ['value' => 'short_text', 'label' => 'Texto breve'],
                ['value' => 'long_text', 'label' => 'Texto amplio'],
                ['value' => 'markdown', 'label' => 'Texto con formato'],
                ['value' => 'number', 'label' => 'Número'],
                ['value' => 'date', 'label' => 'Fecha'],
                ['value' => 'single_select', 'label' => 'Selección única'],
                ['value' => 'multi_select', 'label' => 'Selección múltiple'],
                ['value' => 'boolean', 'label' => 'Sí o no'],
                ['value' => 'repeatable', 'label' => 'Lista o tabla'],
                ['value' => 'master_reference', 'label' => 'Dato institucional'],
                ['value' => 'calculation', 'label' => 'Cálculo automático'],
            ],
        ]);
    }

    public function storeField(
        TemplateVersion $version,
        SaveFieldDefinitionRequest $request,
        SaveFieldDefinition $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->create($version->id, $request->validated(), $actor, $request);

        return back()->with('success', 'Campo agregado al borrador.');
    }

    public function updateField(
        TemplateVersion $version,
        FieldDefinition $field,
        SaveFieldDefinitionRequest $request,
        SaveFieldDefinition $action,
    ): RedirectResponse {
        abort_unless($field->version_plantilla_id === $version->id, 404);
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->update($field, $request->validated(), $actor, $request);

        return back()->with('success', 'Definición de campo actualizada.');
    }

    public function publish(
        TemplateVersion $version,
        ManageTemplatesRequest $request,
        PublishTemplateVersion $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($version->id, $actor, $request);

        return back()->with('success', 'Versión publicada.');
    }

    public function clone(
        TemplateVersion $version,
        ManageTemplatesRequest $request,
        CloneTemplateVersion $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $clone = $action->execute($version->id, $actor, $request);

        return to_route('admin.templates.show', $clone)->with('success', 'Nueva versión en borrador creada desde la anterior.');
    }
}
