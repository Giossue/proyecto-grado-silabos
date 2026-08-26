<?php

namespace App\Modules\Syllabus\Application\Actions;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Operations\Application\Actions\RecordWorkflowOutbox;
use App\Modules\Operations\Application\WorkflowNotificationRecipients;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\CorrectionRequest;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\ReviewObservation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusRevision;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class RequestSyllabusCorrection
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordSyllabusTransition $transitions,
        private readonly RecordAuditEvent $audit,
        private readonly RecordWorkflowOutbox $outbox,
        private readonly WorkflowNotificationRecipients $recipients,
    ) {}

    /** @param list<string> $observationIds */
    public function execute(
        SyllabusRevision $revision,
        array $observationIds,
        string $justification,
        User $actor,
        Request $request,
    ): CorrectionRequest {
        return DB::transaction(function () use ($actor, $justification, $observationIds, $request, $revision): CorrectionRequest {
            $syllabus = Syllabus::query()->lockForUpdate()->findOrFail($revision->silabo_id);
            $latestId = SyllabusRevision::query()
                ->where('silabo_id', $syllabus->id)
                ->orderByDesc('numero_revision')
                ->value('id');
            if ($syllabus->estado !== 'in_review' || $latestId !== $revision->id) {
                throw ValidationException::withMessages([
                    'revision' => 'La revisión dejó de estar disponible para solicitar corrección.',
                ]);
            }
            if (CorrectionRequest::query()->where('revision_silabo_id', $revision->id)->exists()) {
                throw ValidationException::withMessages(['revision' => 'Esta revisión ya tiene una solicitud de corrección.']);
            }

            $ids = array_values(array_unique($observationIds));
            $observations = ReviewObservation::query()
                ->where('revision_silabo_id', $revision->id)
                ->where('estado', 'open')
                ->whereIn('id', $ids)
                ->lockForUpdate()
                ->get();
            if ($ids === [] || $observations->count() !== count($ids)) {
                throw ValidationException::withMessages([
                    'observation_ids' => 'Selecciona observaciones abiertas de la revisión vigente.',
                ]);
            }

            $correction = CorrectionRequest::query()->create([
                'silabo_id' => $syllabus->id,
                'revision_silabo_id' => $revision->id,
                'justificacion' => $justification,
                'solicitado_por' => $actor->id,
                'solicitado_en' => now(),
            ]);
            $createdAt = now();
            foreach ($observations as $observation) {
                DB::table('solicitud_correccion_observaciones')->insert([
                    'id' => (string) Str::uuid(),
                    'solicitud_correccion_id' => $correction->id,
                    'observacion_revision_id' => $observation->id,
                    'created_at' => $createdAt,
                ]);
            }

            $syllabus->update([
                'estado' => 'correction_requested',
                'lock_version' => $syllabus->lock_version + 1,
                'guardado_en' => now(),
            ]);
            $activeRole = $this->roles->resolve($request);
            $this->transitions->execute(
                $syllabus,
                $revision,
                'in_review',
                'correction_requested',
                'request_correction',
                $actor,
                $activeRole,
                ['observation_count' => $observations->count()],
            );
            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'syllabus.correction_requested',
                resourceType: 'correction_request',
                resourceId: $correction->id,
                result: 'success',
                metadata: ['revision_number' => $revision->numero_revision, 'observation_count' => $observations->count()],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );
            $this->outbox->execute(
                syllabus: $syllabus,
                eventType: 'syllabus.correction_requested',
                deduplicationKey: "syllabus.correction_requested:{$correction->id}",
                recipientIds: $this->recipients->teachersFor($syllabus),
                revisionNumber: $revision->numero_revision,
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $correction;
        });
    }
}
