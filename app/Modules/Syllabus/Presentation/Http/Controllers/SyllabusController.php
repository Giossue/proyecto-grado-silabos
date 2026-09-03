<?php

namespace App\Modules\Syllabus\Presentation\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Configuration\Domain\TableLayout;
use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateBlock;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateSection;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Syllabus\Application\Actions\RespondToObservation;
use App\Modules\Syllabus\Application\Actions\StartDraft;
use App\Modules\Syllabus\Application\Actions\SubmitSyllabus;
use App\Modules\Syllabus\Application\Actions\UpdateDraftField;
use App\Modules\Syllabus\Application\Actions\ValidateDraft;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\FieldValue;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\RepeatableRow;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\ReviewObservation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusRevision;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\ValidationRun;
use App\Modules\Syllabus\Presentation\Http\Requests\RespondObservationRequest;
use App\Modules\Syllabus\Presentation\Http\Requests\SubmitSyllabusRequest;
use App\Modules\Syllabus\Presentation\Http\Requests\UpdateDraftFieldRequest;
use App\Modules\Syllabus\Presentation\Http\Requests\ViewSyllabiRequest;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response;

class SyllabusController extends Controller
{
    public function index(ViewSyllabiRequest $request, ActiveRole $roles): Response
    {
        $activeRole = $roles->resolve($request);
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $filters = $request->validated();
        $search = is_string($filters['q'] ?? null) ? trim($filters['q']) : null;
        $state = in_array($filters['state'] ?? null, [
            'sin_iniciar', 'borrador', 'en_revision', 'correccion_solicitada', 'aprobado',
        ], true) ? $filters['state'] : null;

        return Inertia::render('Teacher/Syllabi/Index', [
            'filters' => ['q' => $search ?: null, 'state' => $state],
            'syllabi' => Syllabus::query()
                ->whereHas('convocation', fn ($query) => $query->where('carrera_id', $activeRole?->carrera_id))
                ->whereHas('collaborators', fn ($query) => $query->where('usuario_id', $user->id))
                // La búsqueda mira la asignatura y la convocatoria, que es como se
                // recuerda un expediente: por la materia y por el periodo en que se pidió.
                ->when($search, fn ($query, string $term) => $query->where(
                    fn ($outer) => $outer
                        ->whereRaw("contexto_academico->'subject'->>'name' ILIKE ?", ["%{$term}%"])
                        ->orWhereRaw("contexto_academico->'subject'->>'code' ILIKE ?", ["%{$term}%"])
                        ->orWhereHas('convocation', fn ($convocation) => $convocation
                            ->whereRaw('nombre ILIKE ?', ["%{$term}%"])),
                ))
                ->when($state, fn ($query, string $value) => $query->where('estado', $value))
                ->with(['convocation:id,nombre,periodo_academico_id', 'convocation.academicPeriod:id,nombre', 'subject:id,nombre,codigo_institucional', 'scopes.parallel:id,codigo'])
                ->orderByDesc('actualizado_en')
                ->paginate(15)
                ->withQueryString()
                ->through(fn (Syllabus $syllabus) => [
                    'id' => $syllabus->id,
                    'subject' => $syllabus->academicSubjectName(),
                    'code' => $syllabus->academicSubjectCode(),
                    'convocation' => $syllabus->convocation->nombre,
                    'period' => $syllabus->convocation->academicPeriod->nombre,
                    'state' => $syllabus->estado,
                    'completion' => (float) $syllabus->porcentaje_completitud,
                    'parallels' => $syllabus->scopes->pluck('parallel.codigo')->unique()->values(),
                    'guardado_en' => $syllabus->guardado_en?->toIso8601String(),
                ]),
        ]);
    }

    public function show(Syllabus $syllabus, Request $request): Response
    {
        abort_unless($request->user()?->can('view', $syllabus) === true, 403);

        return Inertia::render('Teacher/Syllabi/Show', ['syllabus' => $this->syllabusPayload($syllabus)]);
    }

    public function start(Syllabus $syllabus, Request $request, StartDraft $action): RedirectResponse
    {
        abort_unless($request->user()?->can('start', $syllabus) === true, 403);
        $actor = $request->user();
        $action->execute($syllabus->id, $actor, $request);

        return to_route('syllabi.edit', $syllabus)->with('success', 'Borrador iniciado con la plantilla y los datos maestros fijados.');
    }

    public function edit(Syllabus $syllabus, Request $request): Response
    {
        abort_unless($request->user()?->can('edit', $syllabus) === true, 403);

        return Inertia::render('Teacher/Syllabi/Edit', ['syllabus' => $this->syllabusPayload($syllabus)]);
    }

    public function submitConfirmation(Syllabus $syllabus, Request $request): Response
    {
        abort_unless($request->user()?->can('submit', $syllabus) === true, 403);
        abort_unless(in_array($syllabus->estado, ['borrador', 'correccion_solicitada'], true), 404);

        return Inertia::render('Teacher/Syllabi/Submit', [
            'syllabus' => $this->syllabusPayload($syllabus),
        ]);
    }

    public function submit(
        Syllabus $syllabus,
        SubmitSyllabusRequest $request,
        SubmitSyllabus $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $revision = $action->execute(
            $syllabus,
            $request->integer('version_bloqueo'),
            $request->string('idempotency_key')->toString(),
            $actor,
            $request,
        );

        return to_route('syllabi.show', $syllabus)
            ->with('success', "Revisión {$revision->numero_revision} enviada y fijada correctamente.");
    }

    public function respondObservation(
        Syllabus $syllabus,
        ReviewObservation $observation,
        RespondObservationRequest $request,
        RespondToObservation $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute(
            $syllabus,
            $observation,
            $request->string('content')->toString(),
            $actor,
            $request,
        );

        return back()->with('success', 'Respuesta guardada. Se incluirá al reenviar la corrección.');
    }

    public function updateField(
        Syllabus $syllabus,
        FieldDefinition $field,
        UpdateDraftFieldRequest $request,
        UpdateDraftField $action,
    ): JsonResponse {
        $actor = $request->user();
        $updated = $action->execute($syllabus, $field, $request->draftData(), $actor, $request);

        return response()->json([
            'message' => 'Borrador guardado.',
            'version_bloqueo' => $updated->version_bloqueo,
            'completion' => (float) $updated->porcentaje_completitud,
            'guardado_en' => $updated->guardado_en?->toIso8601String(),
            'rows' => $field->tipo === 'repetible'
                ? $updated->rows()->where('definicion_campo_id', $field->id)->orderBy('posicion')->get(['id', 'datos', 'posicion'])
                : [],
        ]);
    }

    public function validateDraft(Syllabus $syllabus, Request $request, ValidateDraft $action): RedirectResponse
    {
        abort_unless($request->user()?->can('edit', $syllabus) === true, 403);
        $actor = $request->user();
        $run = $action->execute($syllabus, $actor, $request);

        return back()->with('success', $run->errores_bloqueantes === 0
            ? 'Validación completada sin errores bloqueantes.'
            : 'Validación completada. Revisa los campos señalados.');
    }

    /** @return array<string, mixed> */
    private function syllabusPayload(Syllabus $syllabus): array
    {
        $syllabus->load([
            'convocation.academicPeriod', 'subject', 'scopes.parallel', 'teachers:id,nombre',
            'template.sections.blocks.fields', 'values', 'rows',
            'validationRuns' => fn ($query) => $query->with('results')->latest('completado_en')->limit(1),
            'revisions' => fn ($query) => $query->with([
                'submitter:id,nombre', 'approval.approver:id,nombre',
                'correctionRequest.observations', 'observations.response.respondent:id,nombre',
            ]),
            'reopenings' => fn ($query) => $query->with('reopener:id,nombre')->latest('reabierto_en'),
        ]);
        $values = $syllabus->values->keyBy('definicion_campo_id');
        $rows = $syllabus->rows->groupBy('definicion_campo_id');
        $lastValidation = $syllabus->validationRuns->first();

        return [
            'id' => $syllabus->id,
            'subject' => $syllabus->academicSubjectName(),
            'code' => $syllabus->academicSubjectCode(),
            'convocation' => $syllabus->convocation->nombre,
            'period' => $syllabus->convocation->academicPeriod->nombre,
            'state' => $syllabus->estado,
            'version_bloqueo' => $syllabus->version_bloqueo,
            'completion' => (float) $syllabus->porcentaje_completitud,
            'guardado_en' => $syllabus->guardado_en?->toIso8601String(),
            'parallels' => $syllabus->scopes->pluck('parallel.codigo')->unique()->values(),
            'teachers' => $syllabus->teachers->pluck('nombre')->unique()->values(),
            'sections' => $syllabus->template->sections
                ->map(fn (TemplateSection $section): array => $this->sectionPayload($section, $values, $rows))
                ->values(),
            'validation' => $lastValidation instanceof ValidationRun ? [
                'completed_at' => $lastValidation->completado_en->toIso8601String(),
                'blocking_errors' => $lastValidation->errores_bloqueantes,
                'warnings' => $lastValidation->advertencias,
                'results' => $lastValidation->results->map(fn ($result) => [
                    'field_id' => $result->definicion_campo_id,
                    'code' => $result->codigo,
                    'severity' => $result->severidad,
                    'message' => $result->mensaje,
                ])->values(),
            ] : null,
            'revisions' => $syllabus->revisions->sortBy('numero_revision')->map(fn (SyllabusRevision $revision): array => [
                'id' => $revision->id,
                'number' => $revision->numero_revision,
                'submitted_at' => $revision->enviado_en->toIso8601String(),
                'submitted_by' => $revision->submitter->nombre,
                'approved_at' => $revision->approval?->aprobado_en->toIso8601String(),
            ])->values(),
            'observations' => $this->teacherObservationsPayload($syllabus),
            'reopening' => $syllabus->reopenings->first() === null ? null : [
                'cause' => $syllabus->reopenings->first()->causa,
                'reopened_at' => $syllabus->reopenings->first()->reabierto_en->toIso8601String(),
                'reopened_by' => $syllabus->reopenings->first()->reopener->nombre,
            ],
        ];
    }

    /** @return list<array<string, mixed>> */
    private function teacherObservationsPayload(Syllabus $syllabus): array
    {
        $payload = [];
        foreach ($syllabus->revisions->sortBy('numero_revision') as $revision) {
            $requestedIds = $revision->correctionRequest?->observations->pluck('id') ?? collect();
            foreach ($revision->observations as $observation) {
                $payload[] = [
                    'id' => $observation->id,
                    'revision_number' => $revision->numero_revision,
                    'section_key' => $observation->clave_seccion,
                    'field_key' => $observation->clave_campo,
                    'content' => $observation->contenido,
                    'state' => $observation->estado,
                    'requested' => $requestedIds->contains($observation->id),
                    'response' => $observation->response === null ? null : [
                        'content' => $observation->response->contenido,
                        'responded_at' => $observation->response->respondido_en->toIso8601String(),
                        'fixed' => $observation->response->revision_respuesta_id !== null,
                    ],
                ];
            }
        }

        return $payload;
    }

    /**
     * @param  Collection<string, FieldValue>  $values
     * @param  Collection<string, EloquentCollection<int, RepeatableRow>>  $rows
     * @return array<string, mixed>
     */
    private function sectionPayload(TemplateSection $section, $values, $rows): array
    {
        $blocks = [];
        foreach ($section->blocks as $block) {
            $blocks[] = $this->blockPayload($block, $values, $rows);
        }

        return [
            'id' => $section->id,
            'key' => $section->clave,
            'title' => $section->titulo,
            'description' => $section->descripcion,
            'blocks' => $blocks,
        ];
    }

    /**
     * @param  Collection<string, FieldValue>  $values
     * @param  Collection<string, EloquentCollection<int, RepeatableRow>>  $rows
     * @return array<string, mixed>
     */
    private function blockPayload(TemplateBlock $block, Collection $values, Collection $rows): array
    {
        $fields = [];
        foreach ($block->fields as $field) {
            $fieldRows = [];
            foreach ($rows->get($field->id) ?? [] as $row) {
                $fieldRows[] = [
                    'id' => $row->id,
                    'data' => $row->datos,
                    'position' => $row->posicion,
                ];
            }
            $fields[] = [
                'id' => $field->id,
                'key' => $field->clave,
                'label' => $field->etiqueta,
                'help' => $field->ayuda,
                'type' => $field->tipo,
                'options' => $this->fieldOptions($field),
                'required' => $field->obligatorio,
                'inherited' => $field->heredado,
                'teacher_editable' => $field->editable_docente,
                'ai_enabled' => $field->ia_habilitada
                    && in_array($field->tipo, ['texto_corto', 'texto_largo', 'markdown'], true),
                'value' => $values->get($field->id)?->valor,
                'rows' => $fieldRows,
            ];
        }

        return [
            'id' => $block->id,
            'title' => $block->titulo,
            'content_type' => $block->configuredContentType()
                ?? ($block->tipo === 'repetible' ? 'table' : 'text'),
            'table' => TableLayout::fromBlock($block),
            'fields' => $fields,
        ];
    }

    /** @return list<array{value: string, label: string}> */
    private function fieldOptions(FieldDefinition $field): array
    {
        $options = $field->opciones ?? [];

        $normalized = [];
        foreach ($options as $option) {
            if (is_string($option) || is_int($option)) {
                $normalized[] = ['value' => (string) $option, 'label' => (string) $option];

                continue;
            }
            if (! is_array($option) || (! is_string($option['value'] ?? null) && ! is_int($option['value'] ?? null))) {
                continue;
            }
            $value = (string) $option['value'];
            $normalized[] = [
                'value' => $value,
                'label' => is_string($option['label'] ?? null) ? $option['label'] : $value,
            ];
        }

        return $normalized;
    }
}
