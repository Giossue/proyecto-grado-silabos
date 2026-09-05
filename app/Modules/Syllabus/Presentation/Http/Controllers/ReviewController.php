<?php

namespace App\Modules\Syllabus\Presentation\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Syllabus\Application\Actions\AddReviewObservation;
use App\Modules\Syllabus\Application\Actions\ApproveSyllabus;
use App\Modules\Syllabus\Application\Actions\ReopenSyllabus;
use App\Modules\Syllabus\Application\Actions\RequestSyllabusCorrection;
use App\Modules\Syllabus\Application\Actions\ResetSyllabus;
use App\Modules\Syllabus\Application\Actions\TransferSyllabusTeacher;
use App\Modules\Syllabus\Application\Actions\VerifyObservation;
use App\Modules\Syllabus\Application\IdentificationCard;
use App\Modules\Syllabus\Application\RevisionDiff;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\ReviewObservation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusRevision;
use App\Modules\Syllabus\Presentation\Http\Requests\ApproveSyllabusRequest;
use App\Modules\Syllabus\Presentation\Http\Requests\ReopenSyllabusRequest;
use App\Modules\Syllabus\Presentation\Http\Requests\ResetSyllabusRequest;
use App\Modules\Syllabus\Presentation\Http\Requests\StoreCorrectionRequest;
use App\Modules\Syllabus\Presentation\Http\Requests\StoreObservationRequest;
use App\Modules\Syllabus\Presentation\Http\Requests\TransferSyllabusTeacherRequest;
use App\Modules\Syllabus\Presentation\Http\Requests\VerifyObservationRequest;
use App\Modules\Syllabus\Presentation\Http\Requests\ViewReviewsRequest;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class ReviewController extends Controller
{
    public function index(ViewReviewsRequest $request, ActiveRole $roles): Response
    {
        $activeRole = $roles->resolve($request);
        $state = $request->string('state')->toString();
        $search = trim($request->string('search')->toString());

        $query = Syllabus::query()
            ->whereHas('convocation', fn ($convocation) => $convocation->where('carrera_id', $activeRole?->carrera_id))
            ->whereHas('revisions')
            ->with([
                'convocation.process.academicPeriod:id,nombre',
                'subject:id,nombre,codigo_institucional',
                'teachers:id,nombre',
                'revisions' => fn ($revision) => $revision
                    ->orderByDesc('numero_revision')
                    ->limit(1),
            ])
            ->withCount(['reviewObservations as unresolved_observations_count' => fn ($observation) => $observation->where('estado', '!=', 'verificada')]);
        if ($state !== '') {
            $query->where('estado', $state);
        } else {
            $query->whereIn('estado', ['en_revision', 'correccion_solicitada', 'aprobado']);
        }
        if ($search !== '') {
            $escaped = addcslashes($search, '%_\\');
            $query->whereHas('subject', fn ($subject) => $subject
                ->where('nombre', 'ilike', "%{$escaped}%")
                ->orWhere('codigo_institucional', 'ilike', "%{$escaped}%"));
        }

        return Inertia::render('Coordination/Reviews/Index', [
            'filters' => ['state' => $state, 'search' => $search],
            'syllabi' => $query->orderByDesc('actualizado_en')->paginate(15)->withQueryString()
                ->through(function (Syllabus $syllabus): array {
                    $revision = $syllabus->revisions->first();

                    return [
                        'id' => $syllabus->id,
                        'revision_id' => $revision?->id,
                        'revision_number' => $revision?->numero_revision,
                        'subject' => $syllabus->academicSubjectName(),
                        'code' => $syllabus->academicSubjectCode(),
                        'period' => $syllabus->convocation->process->academicPeriod->nombre,
                        'state' => $syllabus->estado,
                        'teachers' => $syllabus->teachers->pluck('nombre')->values(),
                        'unresolved_observations' => (int) $syllabus->unresolved_observations_count,
                        'submitted_at' => $revision?->enviado_en->toIso8601String(),
                    ];
                }),
        ]);
    }

    public function show(SyllabusRevision $revision, Request $request): Response
    {
        abort_unless($request->user()?->can('review', $revision) === true, 403);

        return Inertia::render('Coordination/Reviews/Show', $this->reviewPayload($revision));
    }

    public function storeObservation(
        SyllabusRevision $revision,
        StoreObservationRequest $request,
        AddReviewObservation $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute(
            $revision,
            $request->filled('section_key') ? $request->string('section_key')->toString() : null,
            $request->filled('field_key') ? $request->string('field_key')->toString() : null,
            $request->string('content')->toString(),
            $actor,
            $request,
        );

        return back()->with('success', 'Observación registrada en esta revisión.');
    }

    public function requestCorrection(
        SyllabusRevision $revision,
        StoreCorrectionRequest $request,
        RequestSyllabusCorrection $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $validated = $request->validated();
        $ids = is_array($validated['observation_ids'])
            ? array_values(array_filter($validated['observation_ids'], is_string(...)))
            : [];
        $action->execute(
            $revision,
            $ids,
            $request->string('justification')->toString(),
            $actor,
            $request,
        );

        return back()->with('success', 'Corrección solicitada; el docente ya puede editar una nueva versión de trabajo.');
    }

    public function verifyObservation(
        ReviewObservation $observation,
        VerifyObservationRequest $request,
        VerifyObservation $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($observation, $actor, $request);

        return back()->with('success', 'Observación verificada como resuelta.');
    }

    public function approve(
        SyllabusRevision $revision,
        ApproveSyllabusRequest $request,
        ApproveSyllabus $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute(
            $revision,
            $request->string('idempotency_key')->toString(),
            $actor,
            $request,
        );

        return back()->with('success', "Revisión {$revision->numero_revision} aprobada y fijada.");
    }

    public function reopen(
        Syllabus $syllabus,
        ReopenSyllabusRequest $request,
        ReopenSyllabus $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute(
            $syllabus,
            $request->string('cause')->toString(),
            $request->string('idempotency_key')->toString(),
            $actor,
            $request,
        );

        return back()->with('success', 'Sílabo reabierto. La aprobación anterior permanece intacta.');
    }

    public function compare(
        SyllabusRevision $before,
        SyllabusRevision $after,
        Request $request,
        RevisionDiff $diff,
    ): Response {
        abort_unless($request->user()?->can('view', $before) === true, 403);
        abort_unless($request->user()->can('view', $after) === true, 403);
        if ($before->silabo_id !== $after->silabo_id) {
            throw ValidationException::withMessages(['revisions' => 'Solo pueden compararse revisiones del mismo expediente.']);
        }
        if ($before->numero_revision > $after->numero_revision) {
            [$before, $after] = [$after, $before];
        }
        $syllabus = $before->syllabus()->with(['subject', 'convocation.process.academicPeriod'])->firstOrFail();

        return Inertia::render('Syllabi/Compare', [
            'syllabus' => [
                'id' => $syllabus->id,
                'subject' => $syllabus->academicSubjectName(),
                'code' => $syllabus->academicSubjectCode(),
                'period' => $syllabus->convocation->process->academicPeriod->nombre,
            ],
            'comparison' => $diff->compare($before, $after),
        ]);
    }

    /** @return array<string, mixed> */
    private function reviewPayload(SyllabusRevision $revision): array
    {
        $revision->load([
            'submitter:id,nombre',
            'syllabus.subject',
            'syllabus.convocation.process.academicPeriod',
            'syllabus.teachers:id,nombre',
            'syllabus.revisions.submitter:id,nombre',
            'syllabus.revisions.observations.creator:id,nombre',
            'syllabus.revisions.observations.response.respondent:id,nombre',
            'syllabus.revisions.correctionRequest.observations',
            'syllabus.revisions.approval.approver:id,nombre',
            'syllabus.reopenings.reopener:id,nombre',
        ]);
        $syllabus = $revision->syllabus;
        $latest = $syllabus->revisions->sortByDesc('numero_revision')->first();
        $latestReopening = $syllabus->reopenings->sortByDesc('reabierto_en')->first();

        return [
            'syllabus' => [
                'id' => $syllabus->id,
                'subject' => $syllabus->academicSubjectName(),
                'code' => $syllabus->academicSubjectCode(),
                'period' => $syllabus->convocation->process->academicPeriod->nombre,
                'state' => $syllabus->estado,
                'teachers' => $syllabus->teachers->pluck('nombre')->values(),
            ],
            'revision' => [
                'id' => $revision->id,
                'number' => $revision->numero_revision,
                'submitted_at' => $revision->enviado_en->toIso8601String(),
                'submitted_by' => $revision->submitter->nombre,
                'snapshot' => $revision->fotografia,
                // Ficha de identificación dibujada desde la copia (I-34); nula en copias antiguas.
                'identification' => is_array($revision->fotografia['identification'] ?? null)
                    ? IdentificationCard::grid($revision->fotografia['identification'])
                    : null,
                'is_current' => $latest?->id === $revision->id,
            ],
            'history' => $syllabus->revisions->sortBy('numero_revision')->map(fn (SyllabusRevision $item): array => [
                'id' => $item->id,
                'number' => $item->numero_revision,
                'submitted_at' => $item->enviado_en->toIso8601String(),
                'submitted_by' => $item->submitter->nombre,
                'approved_at' => $item->approval?->aprobado_en->toIso8601String(),
            ])->values(),
            'observations' => $this->reviewObservationsPayload($syllabus, $latest),
            'correction_request' => $revision->correctionRequest === null ? null : [
                'justification' => $revision->correctionRequest->justificacion,
                'requested_at' => $revision->correctionRequest->solicitado_en->toIso8601String(),
            ],
            // El relevo necesita identidades, no nombres: quién sale y entre quiénes elegir.
            'reset' => [
                'allowed' => in_array($syllabus->estado, ResetSyllabus::RESETTABLE_STATES, true)
                    && in_array($syllabus->convocation()->value('estado'), ['abierta', 'pausada'], true),
            ],
            'transfer' => [
                'allowed' => $syllabus->estado !== 'en_revision',
                'current' => $syllabus->teachers->map(fn (User $teacher): array => [
                    'id' => $teacher->id,
                    'nombre' => $teacher->nombre,
                ])->unique('id')->values(),
                'candidates' => $this->careerTeachers($syllabus),
            ],
            'reopening' => $latestReopening === null ? null : [
                'cause' => $latestReopening->causa,
                'reopened_at' => $latestReopening->reabierto_en->toIso8601String(),
                'reopened_by' => $latestReopening->reopener->nombre,
            ],
        ];
    }

    /**
     * Docentes con rol vigente en la carrera del expediente. Es el universo del que puede
     * salir un reemplazo: fuera de la carrera no hay alcance que lo sostenga.
     *
     * @return list<array{id: string, nombre: string}>
     */
    private function careerTeachers(Syllabus $syllabus): array
    {
        $teacherIds = RoleAssignment::query()
            ->effective()
            ->where('carrera_id', $syllabus->convocation->carrera_id)
            ->whereHas('role', fn ($role) => $role->where('codigo', RoleCode::Teacher->value))
            ->pluck('usuario_id');

        $payload = [];
        foreach (User::query()->where('activo', true)->whereIn('id', $teacherIds)->orderBy('nombre')->get(['id', 'nombre']) as $teacher) {
            $payload[] = ['id' => $teacher->id, 'nombre' => $teacher->nombre];
        }

        return $payload;
    }

    /** @return list<array<string, mixed>> */
    private function reviewObservationsPayload(Syllabus $syllabus, ?SyllabusRevision $latest): array
    {
        $revisionNumbers = [];
        foreach ($syllabus->revisions as $revision) {
            $revisionNumbers[$revision->id] = $revision->numero_revision;
        }

        $payload = [];
        foreach ($syllabus->revisions->sortBy('numero_revision') as $revision) {
            $requestedIds = $revision->correctionRequest?->observations->pluck('id') ?? collect();
            foreach ($revision->observations as $observation) {
                $response = $observation->response;
                $payload[] = [
                    'id' => $observation->id,
                    'revision_number' => $revision->numero_revision,
                    'section_key' => $observation->clave_seccion,
                    'field_key' => $observation->clave_campo,
                    'content' => $observation->contenido,
                    'state' => $observation->estado,
                    'requested' => $requestedIds->contains($observation->id),
                    'can_verify' => $syllabus->estado === 'en_revision'
                        && $observation->estado !== 'verificada'
                        && (! $requestedIds->contains($observation->id)
                            || $response?->revision_respuesta_id === $latest?->id),
                    'created_by' => $observation->creator->nombre,
                    'creado_en' => $observation->creado_en->toIso8601String(),
                    'response' => $response === null ? null : [
                        'content' => $response->contenido,
                        'responded_by' => $response->respondent->nombre,
                        'responded_at' => $response->respondido_en->toIso8601String(),
                        'revision_number' => $response->revision_respuesta_id === null
                            ? null
                            : ($revisionNumbers[$response->revision_respuesta_id] ?? null),
                    ],
                ];
            }
        }

        return $payload;
    }

    public function reset(
        Syllabus $syllabus,
        ResetSyllabusRequest $request,
        ResetSyllabus $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($syllabus, $request->string('reason')->toString(), $actor, $request);

        return to_route('reviews.index')->with('success', 'Sílabo reiniciado. El docente empieza de cero con la malla y la plantilla actuales; el historial se conserva.');
    }

    public function transferTeacher(
        Syllabus $syllabus,
        TransferSyllabusTeacherRequest $request,
        TransferSyllabusTeacher $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute(
            $syllabus,
            $request->string('outgoing_user_id')->toString(),
            $request->string('incoming_user_id')->toString(),
            $request->backing(),
            $request->string('idempotency_key')->toString(),
            $actor,
            $request,
        );

        return back()->with('success', 'Relevo registrado. El expediente queda a cargo del docente entrante.');
    }
}
