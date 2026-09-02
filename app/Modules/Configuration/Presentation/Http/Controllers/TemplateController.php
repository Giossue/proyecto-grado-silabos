<?php

namespace App\Modules\Configuration\Presentation\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Configuration\Application\Actions\CreateSyllabusTemplate;
use App\Modules\Configuration\Application\Actions\DeleteTemplateBlock;
use App\Modules\Configuration\Application\Actions\DeleteTemplateSection;
use App\Modules\Configuration\Application\Actions\ReorderTemplateBlocks;
use App\Modules\Configuration\Application\Actions\ReorderTemplateSections;
use App\Modules\Configuration\Application\Actions\SaveFieldDefinition;
use App\Modules\Configuration\Application\Actions\SaveTemplateSection;
use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateBlock;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateSection;
use App\Modules\Configuration\Presentation\Http\Requests\CreateTemplateRequest;
use App\Modules\Configuration\Presentation\Http\Requests\ManageTemplatesRequest;
use App\Modules\Configuration\Presentation\Http\Requests\ReorderTemplateBlocksRequest;
use App\Modules\Configuration\Presentation\Http\Requests\ReorderTemplateSectionsRequest;
use App\Modules\Configuration\Presentation\Http\Requests\SaveFieldDefinitionRequest;
use App\Modules\Configuration\Presentation\Http\Requests\SaveTemplateSectionRequest;
use App\Modules\Syllabus\Application\ProcessLocks;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class TemplateController extends Controller
{
    /**
     * Una sola plantilla (I-32): si existe se abre directo, como la malla de una
     * carrera. La lista solo aparece cuando todavía no hay nada que abrir.
     */
    public function index(ManageTemplatesRequest $request, ProcessLocks $locks): Response|RedirectResponse
    {
        $template = SyllabusTemplate::query()->where('es_institucional', true)->first();
        if ($template !== null) {
            return to_route('admin.templates.show', $template);
        }

        return Inertia::render('Admin/Templates/Index', [
            'processLock' => $locks->templateLockReason(),
        ]);
    }

    public function store(CreateTemplateRequest $request, CreateSyllabusTemplate $action): RedirectResponse
    {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $template = $action->execute([
            'nombre' => $request->string('nombre')->toString(),
            'description' => $request->filled('description') ? $request->string('description')->toString() : null,
        ], $actor, $request);

        return to_route('admin.templates.show', $template)->with('success', 'Plantilla creada con las doce áreas base.');
    }

    public function show(SyllabusTemplate $template, ManageTemplatesRequest $request, ProcessLocks $locks): Response
    {
        $this->ensureInstitutional($template);
        $template->load('sections.blocks.fields');

        return Inertia::render('Admin/Templates/Show', [
            'processLock' => $locks->templateLockReason(),
            'template' => [
                'id' => $template->id,
                'name' => $template->nombre,
                'description' => $template->descripcion,
                'sections' => $template->sections->map(fn (TemplateSection $section) => [
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

        if ($field?->tipo === 'repetible' || $block->tipo === 'repetible') {
            return 'table';
        }

        return 'text';
    }

    private function ensureInstitutional(SyllabusTemplate $template): void
    {
        abort_unless($template->es_institucional, 404);
    }

    public function storeField(
        SyllabusTemplate $template,
        SaveFieldDefinitionRequest $request,
        SaveFieldDefinition $action,
    ): RedirectResponse {
        $this->ensureInstitutional($template);
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->create($template->id, $request->validated(), $actor, $request);

        return back()->with('success', 'Campo agregado al bloque.');
    }

    public function updateField(
        SyllabusTemplate $template,
        FieldDefinition $field,
        SaveFieldDefinitionRequest $request,
        SaveFieldDefinition $action,
    ): RedirectResponse {
        $this->ensureInstitutional($template);
        abort_unless($field->plantilla_id === $template->id, 404);
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->update($field, $request->validated(), $actor, $request);

        return back()->with('success', 'Campo actualizado.');
    }

    public function storeSection(
        SyllabusTemplate $template,
        SaveTemplateSectionRequest $request,
        SaveTemplateSection $action,
    ): RedirectResponse {
        $this->ensureInstitutional($template);
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->create($template->id, $request->validated(), $actor, $request);

        return back()->with('success', 'Bloque agregado al borrador.');
    }

    public function updateSection(
        SyllabusTemplate $template,
        TemplateSection $section,
        SaveTemplateSectionRequest $request,
        SaveTemplateSection $action,
    ): RedirectResponse {
        $this->ensureInstitutional($template);
        abort_unless($section->plantilla_id === $template->id, 404);
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->update($section, $request->validated(), $actor, $request);

        return back()->with('success', 'Bloque actualizado.');
    }

    public function reorderBlocks(
        SyllabusTemplate $template,
        ReorderTemplateBlocksRequest $request,
        ReorderTemplateBlocks $action,
    ): RedirectResponse {
        $this->ensureInstitutional($template);
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute(
            $template,
            $request->string('section_id')->toString(),
            $request->collect('block_ids')->filter(fn (mixed $id): bool => is_string($id))->values()->all(),
            $actor,
            $request,
        );

        return back()->with('success', 'Orden de campos actualizado.');
    }

    public function reorderSections(
        SyllabusTemplate $template,
        ReorderTemplateSectionsRequest $request,
        ReorderTemplateSections $action,
    ): RedirectResponse {
        $this->ensureInstitutional($template);
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute(
            $template,
            $request->collect('section_ids')->filter(fn (mixed $id): bool => is_string($id))->values()->all(),
            $actor,
            $request,
        );

        return back()->with('success', 'Orden de bloques actualizado.');
    }

    public function destroyBlock(
        SyllabusTemplate $template,
        TemplateBlock $block,
        ManageTemplatesRequest $request,
        DeleteTemplateBlock $action,
    ): RedirectResponse {
        $this->ensureInstitutional($template);
        abort_unless($block->plantilla_id === $template->id, 404);
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($block, $actor, $request);

        return back()->with('success', 'Campo eliminado.');
    }

    public function destroySection(
        SyllabusTemplate $template,
        TemplateSection $section,
        ManageTemplatesRequest $request,
        DeleteTemplateSection $action,
    ): RedirectResponse {
        $this->ensureInstitutional($template);
        abort_unless($section->plantilla_id === $template->id, 404);
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($section, $actor, $request);

        return back()->with('success', 'Bloque eliminado.');
    }
}
