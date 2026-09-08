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
use App\Modules\Configuration\Application\Actions\SaveTemplateAppearance;
use App\Modules\Configuration\Application\Actions\SaveTemplateDocument;
use App\Modules\Configuration\Application\Actions\SaveTemplateSection;
use App\Modules\Configuration\Application\Actions\UpdateTableLayout;
use App\Modules\Configuration\Application\InstitutionalLogos;
use App\Modules\Configuration\Domain\TemplateAppearance;
use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateBlock;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateSection;
use App\Modules\Configuration\Presentation\Http\Requests\CreateTemplateRequest;
use App\Modules\Configuration\Presentation\Http\Requests\ManageTemplatesRequest;
use App\Modules\Configuration\Presentation\Http\Requests\ReorderTemplateBlocksRequest;
use App\Modules\Configuration\Presentation\Http\Requests\ReorderTemplateSectionsRequest;
use App\Modules\Configuration\Presentation\Http\Requests\SaveFieldDefinitionRequest;
use App\Modules\Configuration\Presentation\Http\Requests\SaveTemplateAppearanceRequest;
use App\Modules\Configuration\Presentation\Http\Requests\SaveTemplateDocumentRequest;
use App\Modules\Configuration\Presentation\Http\Requests\SaveTemplateSectionRequest;
use App\Modules\Configuration\Presentation\Http\Requests\StoreInstitutionLogoRequest;
use App\Modules\Configuration\Presentation\Http\Requests\UpdateTableLayoutRequest;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\ProcessLocks;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\UploadedFile;
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
        $template = SyllabusTemplate::query()->first();
        if ($template !== null) {
            return to_route('admin.templates.show', $template);
        }

        return Inertia::render('Admin/Templates/Index', [
            'processLock' => $locks->templateLockReason(),
        ]);
    }

    public function updateDocument(SyllabusTemplate $template, TemplateBlock $block, SaveTemplateDocumentRequest $request, SaveTemplateDocument $action): RedirectResponse
    {
        abort_unless($block->plantilla_id === $template->id, 404);
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($block, $request->validated('document'), $request->validated('fingerprint'), $actor, $request);

        return back()->with('success', 'Diseño de la plantilla guardado.');
    }

    public function store(CreateTemplateRequest $request, CreateSyllabusTemplate $action): RedirectResponse
    {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $template = $action->execute($actor, $request);

        return to_route('admin.templates.show', $template)->with('success', 'Plantilla creada.');
    }

    public function show(SyllabusTemplate $template, ManageTemplatesRequest $request): Response
    {
        return Inertia::render('Admin/Templates/Show', [
            'template' => [
                'appearance' => TemplateAppearance::fromMapping($template->mapeo_documento),
            ],
        ]);
    }

    public function updateAppearance(
        SyllabusTemplate $template,
        SaveTemplateAppearanceRequest $request,
        SaveTemplateAppearance $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($template, $request->safe()->except('confirm_purge'), $actor, $request);

        return back()->with('success', 'Apariencia de la plantilla guardada.');
    }

    public function storeField(
        SyllabusTemplate $template,
        SaveFieldDefinitionRequest $request,
        SaveFieldDefinition $action,
    ): RedirectResponse {
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

    /** Reemplaza el logo de la universidad que encabeza todos los sílabos. */
    public function storeLogo(StoreInstitutionLogoRequest $request, InstitutionalLogos $logos, RecordAuditEvent $audit, ActiveRole $roles): RedirectResponse
    {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $file = $request->file('logo');
        abort_unless($file instanceof UploadedFile, 422);
        $logos->storeInstitution($file);
        $template = SyllabusTemplate::query()->first();
        $audit->execute(
            actorId: $actor->id,
            roleAssignmentId: $roles->resolve($request)?->id,
            action: 'institucion.logo_actualizado',
            resourceType: 'plantilla_silabo',
            resourceId: $template?->id,
            result: 'exito',
            correlationId: $request->attributes->getString('correlation_id') ?: null,
        );

        return back()->with('success', 'Logo de la universidad actualizado.');
    }

    public function updateTableLayout(
        SyllabusTemplate $template,
        TemplateBlock $block,
        UpdateTableLayoutRequest $request,
        UpdateTableLayout $action,
    ): RedirectResponse {
        abort_unless($block->plantilla_id === $template->id, 404);
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($block, $request->validated(), $actor, $request);

        return back()->with('success', 'Tabla actualizada.');
    }

    public function destroyBlock(
        SyllabusTemplate $template,
        TemplateBlock $block,
        ManageTemplatesRequest $request,
        DeleteTemplateBlock $action,
    ): RedirectResponse {
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
        abort_unless($section->plantilla_id === $template->id, 404);
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($section, $actor, $request);

        return back()->with('success', 'Bloque eliminado.');
    }
}
