<?php

namespace App\Modules\Syllabus\Application\Actions;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Operations\Application\Actions\RecordWorkflowOutbox;
use App\Modules\Operations\Application\WorkflowNotificationRecipients;
use App\Modules\Syllabus\Application\SyllabusSnapshot;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Approval;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Reopening;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ReopenSyllabus
{
    public function __construct(
        private readonly SyllabusSnapshot $snapshots,
        private readonly ActiveRole $roles,
        private readonly RecordSyllabusTransition $transitions,
        private readonly RecordAuditEvent $audit,
        private readonly RecordWorkflowOutbox $outbox,
        private readonly WorkflowNotificationRecipients $recipients,
    ) {}

    public function execute(
        Syllabus $syllabus,
        string $cause,
        string $idempotencyKey,
        User $actor,
        Request $request,
    ): Reopening {
        $existing = $this->existingReopening($syllabus, $idempotencyKey, $actor);
        if ($existing !== null) {
            return $existing;
        }

        return DB::transaction(function () use ($actor, $cause, $idempotencyKey, $request, $syllabus): Reopening {
            $locked = Syllabus::query()->lockForUpdate()->findOrFail($syllabus->id);
            $existing = $this->existingReopening($locked, $idempotencyKey, $actor);
            if ($existing !== null) {
                return $existing;
            }
            if ($locked->estado !== 'approved') {
                throw ValidationException::withMessages(['syllabus' => 'Solo puede reabrirse un sílabo aprobado.']);
            }

            $approval = Approval::query()
                ->with('revision')
                ->where('silabo_id', $locked->id)
                ->latest('aprobado_en')
                ->firstOrFail();
            if ($approval->reopening()->exists()) {
                throw ValidationException::withMessages(['approval' => 'Esta aprobación ya fue reabierta.']);
            }

            $reopening = Reopening::query()->create([
                'silabo_id' => $locked->id,
                'aprobacion_id' => $approval->id,
                'revision_aprobada_id' => $approval->revision_silabo_id,
                'clave_idempotencia' => $idempotencyKey,
                'causa' => $cause,
                'reabierto_por' => $actor->id,
                'reabierto_en' => now(),
            ]);
            $this->snapshots->restore($locked, $approval->revision->snapshot);
            $locked->update([
                'estado' => 'correction_requested',
                'lock_version' => $locked->lock_version + 1,
                'porcentaje_completitud' => 100,
                'guardado_en' => now(),
            ]);
            $activeRole = $this->roles->resolve($request);
            $this->transitions->execute(
                $locked,
                $approval->revision,
                'approved',
                'correction_requested',
                'reopen',
                $actor,
                $activeRole,
                ['approval_id' => $approval->id],
            );
            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'syllabus.reopened',
                resourceType: 'reopening',
                resourceId: $reopening->id,
                result: 'success',
                metadata: ['revision_number' => $approval->revision->numero_revision, 'approval_id' => $approval->id],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );
            $this->outbox->execute(
                syllabus: $locked,
                eventType: 'syllabus.reopened',
                deduplicationKey: "syllabus.reopened:{$reopening->id}",
                recipientIds: $this->recipients->teachersFor($locked),
                revisionNumber: $approval->revision->numero_revision,
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $reopening;
        });
    }

    private function existingReopening(Syllabus $syllabus, string $key, User $actor): ?Reopening
    {
        $reopening = Reopening::query()
            ->where('silabo_id', $syllabus->id)
            ->where('clave_idempotencia', $key)
            ->first();
        if ($reopening !== null && $reopening->reabierto_por !== $actor->id) {
            abort(403);
        }

        return $reopening;
    }
}
