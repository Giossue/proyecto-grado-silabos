<?php

namespace App\Modules\Configuration\Presentation\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Configuration\Application\Actions\CloneTemplateVersion;
use App\Modules\Configuration\Application\Actions\CreateSyllabusTemplate;
use App\Modules\Configuration\Application\Actions\DeleteTemplateBlock;
use App\Modules\Configuration\Application\Actions\DeleteTemplateSection;
use App\Modules\Configuration\Application\Actions\PublishTemplateVersion;
use App\Modules\Configuration\Application\Actions\ReorderTemplateBlocks;
use App\Modules\Configuration\Application\Actions\ReorderTemplateSections;
use App\Modules\Configuration\Application\Actions\SaveFieldDefinition;
use App\Modules\Configuration\Application\Actions\SaveTemplateSection;
use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateBlock;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateSection;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateVersion;
use App\Modules\Configuration\Presentation\Http\Requests\CreateTemplateRequest;
use App\Modules\Configuration\Presentation\Http\Requests\ManageTemplatesRequest;
use App\Modules\Configuration\Presentation\Http\Requests\ReorderTemplateBlocksRequest;
use App\Modules\Configuration\Presentation\Http\Requests\ReorderTemplateSectionsRequest;
use App\Modules\Configuration\Presentation\Http\Requests\SaveFieldDefinitionRequest;
use App\Modules\Configuration\Presentation\Http\Requests\SaveTemplateSectionRequest;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class TemplateController extends Controller
{
    public function index(ManageTemplatesRequest $request): Response
    {
        return Inertia::render('Admin/Templates/Index', [
            'templates' => SyllabusTemplate::query()
                ->where('es_institucional', true)
                ->with(['versions' => fn ($query) => $query->orderByDesc('numero_version')])
                ->orderBy('nombre')
                ->get()
                ->map(fn (SyllabusTemplate $template) => [
                    'id' => $template->id,
                    'name' => $template->nombre,
                    'description' => $template->descripcion,
                    'active' => $template->activo,
                    'versions' => $template->versions->map(fn (TemplateVersion $version) => [
                        'id' => $version->id,
                        'number' => $version->numero_version,
                        'state' => $version->estado,
                        'published_at' => $version->publicado_en?->toIso8601String(),
                    ])->values()->all(),
                ]),
            'hasInstitutionalTemplate' => SyllabusTemplate::query()
                ->where('es_institucional', true)
                ->exists(),
        ]);
    }

    public function store(CreateTemplateRequest $request, CreateSyllabusTemplate $action): RedirectResponse
    {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $version = $action->execute([
            'name' => $request->string('name')->toString(),
            'description' => $request->filled('description') ? $request->string('description')->toString() : null,
        ], $actor, $request);

        return to_route('admin.templates.show', $version)->with('success', 'Plantilla creada con las doce áreas base.');
    }

    public function show(TemplateVersion $version, ManageTemplatesRequest $request): Response
    {
        $this->ensureInstitutional($version);
        $version->load([
            'template.versions' => fn ($query) => $query->orderByDesc('numero_version'),
            'sections.blocks.fields',
        ]);

        return Inertia::render('Admin/Templates/Show', [
            'templateVersion' => [
                'id' => $version->id,
                'number' => $version->numero_version,
                'state' => $version->estado,
                'template' => [
                    'name' => $version->template->nombre,
                    'description' => $version->template->descripcion,
                    'versions' => $version->template->versions->map(fn (TemplateVersion $sibling) => [
                        'id' => $sibling->id,
                        'number' => $sibling->numero_version,
                        'state' => $sibling->estado,
                    ])->values()->all(),
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
                        'content_type' => $this->contentType($block, $block->fields->first()),
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
                            'content_type' => $this->contentType($block, $field),
                        ])->values()->all(),
                    ])->values()->all(),
                ])->values()->all(),
            ],
            'blockTypes' => [
                ['value' => 'text', 'label' => 'Texto'],
                ['value' => 'table', 'label' => 'Tabla'],
                ['value' => 'bulleted_list', 'label' => 'Lista con viñetas'],
                ['value' => 'numbered_list', 'label' => 'Lista numerada'],
            ],
        ]);
    }

    private function contentType(TemplateBlock $block, ?FieldDefinition $field): string
    {
        $contentType = $block->configuredContentType();

        if ($contentType !== null) {
            return $contentType;
        }

        if ($field?->tipo === 'repeatable' || $block->tipo === 'repeatable') {
            return 'table';
        }

        return 'text';
    }

    private function ensureInstitutional(TemplateVersion $version): void
    {
        $version->loadMissing('template:id,es_institucional');
        abort_unless($version->template?->es_institucional, 404);
    }

    public function storeField(
        TemplateVersion $version,
        SaveFieldDefinitionRequest $request,
        SaveFieldDefinition $action,
    ): RedirectResponse {
        $this->ensureInstitutional($version);
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->create($version->id, $request->validated(), $actor, $request);

        return back()->with('success', 'Campo agregado al bloque.');
    }

    public function updateField(
        TemplateVersion $version,
        FieldDefinition $field,
        SaveFieldDefinitionRequest $request,
        SaveFieldDefinition $action,
    ): RedirectResponse {
        $this->ensureInstitutional($version);
        abort_unless($field->version_plantilla_id === $version->id, 404);
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->update($field, $request->validated(), $actor, $request);

        return back()->with('success', 'Campo actualizado.');
    }

    public function storeSection(
        TemplateVersion $version,
        SaveTemplateSectionRequest $request,
        SaveTemplateSection $action,
    ): RedirectResponse {
        $this->ensureInstitutional($version);
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->create($version->id, $request->validated(), $actor, $request);

        return back()->with('success', 'Bloque agregado al borrador.');
    }

    public function updateSection(
        TemplateVersion $version,
        TemplateSection $section,
        SaveTemplateSectionRequest $request,
        SaveTemplateSection $action,
    ): RedirectResponse {
        $this->ensureInstitutional($version);
        abort_unless($section->version_plantilla_id === $version->id, 404);
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->update($section, $request->validated(), $actor, $request);

        return back()->with('success', 'Bloque actualizado.');
    }

    public function reorderBlocks(
        TemplateVersion $version,
        ReorderTemplateBlocksRequest $request,
        ReorderTemplateBlocks $action,
    ): RedirectResponse {
        $this->ensureInstitutional($version);
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute(
            $version,
            $request->string('section_id')->toString(),
            $request->collect('block_ids')->filter(fn (mixed $id): bool => is_string($id))->values()->all(),
            $actor,
            $request,
        );

        return back()->with('success', 'Orden de campos actualizado.');
    }

    public function reorderSections(
        TemplateVersion $version,
        ReorderTemplateSectionsRequest $request,
        ReorderTemplateSections $action,
    ): RedirectResponse {
        $this->ensureInstitutional($version);
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute(
            $version,
            $request->collect('section_ids')->filter(fn (mixed $id): bool => is_string($id))->values()->all(),
            $actor,
            $request,
        );

        return back()->with('success', 'Orden de bloques actualizado.');
    }

    public function destroyBlock(
        TemplateVersion $version,
        TemplateBlock $block,
        ManageTemplatesRequest $request,
        DeleteTemplateBlock $action,
    ): RedirectResponse {
        $this->ensureInstitutional($version);
        abort_unless($block->version_plantilla_id === $version->id, 404);
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($block, $actor, $request);

        return back()->with('success', 'Campo eliminado.');
    }

    public function destroySection(
        TemplateVersion $version,
        TemplateSection $section,
        ManageTemplatesRequest $request,
        DeleteTemplateSection $action,
    ): RedirectResponse {
        $this->ensureInstitutional($version);
        abort_unless($section->version_plantilla_id === $version->id, 404);
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($section, $actor, $request);

        return back()->with('success', 'Bloque eliminado.');
    }

    public function publish(
        TemplateVersion $version,
        ManageTemplatesRequest $request,
        PublishTemplateVersion $action,
    ): RedirectResponse {
        $this->ensureInstitutional($version);
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
        $this->ensureInstitutional($version);
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $clone = $action->execute($version->id, $actor, $request);

        return to_route('admin.templates.show', $clone)->with('success', 'Nueva versión en borrador creada desde la anterior.');
    }
}
