<?php

namespace App\Modules\Syllabus\Application\Actions;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Operations\Application\Actions\RecordWorkflowOutbox;
use App\Modules\Operations\Application\WorkflowNotificationRecipients;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Approval;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\ReviewObservation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusRevision;
use App\Support\CanonicalHasher;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ApproveSyllabus
{
    public function __construct(
        private readonly CanonicalHasher $hasher,
        private readonly ActiveRole $roles,
        private readonly RecordSyllabusTransition $transitions,
        private readonly RecordAuditEvent $audit,
        private readonly RecordWorkflowOutbox $outbox,
        private readonly WorkflowNotificationRecipients $recipients,
    ) {}

    public function execute(
        SyllabusRevision $revision,
        string $idempotencyKey,
        User $actor,
        Request $request,
    ): Approval {
        $existing = $this->existingApproval($revision->syllabus, $idempotencyKey, $actor);
        if ($existing !== null) {
            return $existing;
        }

        return DB::transaction(function () use ($actor, $idempotencyKey, $request, $revision): Approval {
            $syllabus = Syllabus::query()->lockForUpdate()->findOrFail($revision->silabo_id);
            $existing = $this->existingApproval($syllabus, $idempotencyKey, $actor);
            if ($existing !== null) {
                return $existing;
            }
            $latest = SyllabusRevision::query()
                ->where('silabo_id', $syllabus->id)
                ->orderByDesc('numero_revision')
                ->firstOrFail();
            if ($syllabus->estado !== 'en_revision' || $latest->id !== $revision->id) {
                throw ValidationException::withMessages(['revision' => 'Solo puede aprobarse la revisión vigente.']);
            }

            $unresolved = ReviewObservation::query()
                ->whereHas('revision', fn ($query) => $query->where('silabo_id', $syllabus->id))
                ->where('estado', '!=', 'verificada')
                ->count();
            if ($unresolved > 0) {
                throw ValidationException::withMessages([
                    'observations' => "Quedan {$unresolved} observaciones sin verificar.",
                ]);
            }

            $approvedAt = now();
            $fingerprint = $this->hasher->hash([
                'revision_id' => $revision->id,
                'revision_fingerprint' => $revision->huella_sha256,
                'approved_by' => $actor->id,
                'approved_at' => $approvedAt->toIso8601String(),
                'idempotency_key' => $idempotencyKey,
            ]);
            $approval = Approval::query()->create([
                'silabo_id' => $syllabus->id,
                'revision_silabo_id' => $revision->id,
                'clave_idempotencia' => $idempotencyKey,
                'huella_sha256' => $fingerprint,
                'aprobado_por' => $actor->id,
                'aprobado_en' => $approvedAt,
            ]);
            $syllabus->update(['estado' => 'aprobado', 'version_bloqueo' => $syllabus->version_bloqueo + 1]);
            $activeRole = $this->roles->resolve($request);
            $this->transitions->execute($syllabus, $revision, 'en_revision', 'aprobado', 'aprobar', $actor, $activeRole);
            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'silabo.aprobado',
                resourceType: 'aprobacion',
                resourceId: $approval->id,
                result: 'exito',
                metadata: [
                    'revision_number' => $revision->numero_revision,
                    'fingerprint' => $fingerprint,
                    // DT-10 permite que quien redacta apruebe. No se impide, pero el caso
                    // queda distinguible para poder reportarlo sin reconstruirlo.
                    'self_approved' => $revision->enviado_por === $actor->id,
                ],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );
            $this->outbox->execute(
                syllabus: $syllabus,
                eventType: 'silabo.aprobado',
                deduplicationKey: "silabo.aprobado:{$approval->id}",
                recipientIds: $this->recipients->teachersFor($syllabus),
                revisionNumber: $revision->numero_revision,
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $approval;
        });
    }

    private function existingApproval(Syllabus $syllabus, string $key, User $actor): ?Approval
    {
        $approval = Approval::query()
            ->where('silabo_id', $syllabus->id)
            ->where('clave_idempotencia', $key)
            ->first();
        if ($approval !== null && $approval->aprobado_por !== $actor->id) {
            abort(403);
        }

        return $approval;
    }
}
