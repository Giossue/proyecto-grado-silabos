<?php

namespace App\Modules\Syllabus\Application\Actions;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Operations\Application\Actions\RecordWorkflowOutbox;
use App\Modules\Operations\Application\WorkflowNotificationRecipients;
use App\Modules\Syllabus\Application\ConvocationSchedule;
use App\Modules\Syllabus\Application\SyllabusSnapshot;
use App\Modules\Syllabus\Domain\Exceptions\DraftConflictException;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\ObservationResponse;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Reopening;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusRevision;
use App\Support\CanonicalHasher;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SubmitSyllabus
{
    public function __construct(
        private readonly ValidateDraft $validateDraft,
        private readonly ConvocationSchedule $schedule,
        private readonly SyllabusSnapshot $snapshots,
        private readonly CanonicalHasher $hasher,
        private readonly ActiveRole $roles,
        private readonly RecordSyllabusTransition $transitions,
        private readonly RecordAuditEvent $audit,
        private readonly RecordWorkflowOutbox $outbox,
        private readonly WorkflowNotificationRecipients $recipients,
    ) {}

    public function execute(
        Syllabus $syllabus,
        int $expectedLockVersion,
        string $idempotencyKey,
        User $actor,
        Request $request,
    ): SyllabusRevision {
        $existing = $this->existingRevision($syllabus, $idempotencyKey, $actor);
        if ($existing !== null) {
            return $existing;
        }
        if (! in_array($syllabus->estado, ['borrador', 'correccion_solicitada'], true)) {
            throw ValidationException::withMessages(['syllabus' => 'El expediente no está listo para envío.']);
        }

        // El plazo se comprueba antes de validar el contenido: no tiene sentido pedirle a
        // alguien que corrija errores de un envío que de todos modos no se va a admitir.
        $this->schedule->assertOpenForSubmission($syllabus->convocation()->firstOrFail());

        if ($syllabus->version_bloqueo !== $expectedLockVersion) {
            throw new DraftConflictException($syllabus->version_bloqueo);
        }

        $validation = $this->validateDraft->execute($syllabus, $actor, $request);
        if ($validation->errores_bloqueantes > 0) {
            throw ValidationException::withMessages([
                'validation' => 'Corrija los errores determinísticos antes de enviar.',
            ]);
        }

        return DB::transaction(function () use ($actor, $expectedLockVersion, $idempotencyKey, $request, $syllabus): SyllabusRevision {
            $locked = Syllabus::query()->lockForUpdate()->findOrFail($syllabus->id);
            $existing = $this->existingRevision($locked, $idempotencyKey, $actor);
            if ($existing !== null) {
                return $existing;
            }
            if ($locked->version_bloqueo !== $expectedLockVersion) {
                throw new DraftConflictException($locked->version_bloqueo);
            }
            if (! in_array($locked->estado, ['borrador', 'correccion_solicitada'], true)) {
                throw ValidationException::withMessages(['syllabus' => 'La transición de envío ya no está permitida.']);
            }

            $previous = SyllabusRevision::query()
                ->where('silabo_id', $locked->id)
                ->orderByDesc('numero_revision')
                ->lockForUpdate()
                ->first();
            $reopening = $locked->estado === 'correccion_solicitada'
                ? Reopening::query()
                    ->where('silabo_id', $locked->id)
                    ->whereNotIn('id', SyllabusRevision::query()->whereNotNull('reapertura_id')->select('reapertura_id'))
                    ->latest('reabierto_en')
                    ->first()
                : null;
            $snapshot = $this->snapshots->build($locked);
            $revision = SyllabusRevision::query()->create([
                'silabo_id' => $locked->id,
                'revision_anterior_id' => $previous?->id,
                'reapertura_id' => $reopening?->id,
                'numero_revision' => $previous === null ? 1 : $previous->numero_revision + 1,
                'clave_idempotencia' => $idempotencyKey,
                'version_bloqueo_origen' => $locked->version_bloqueo,
                'fotografia' => $snapshot,
                'huella_sha256' => $this->hasher->hash($snapshot),
                'enviado_por' => $actor->id,
                'enviado_en' => now(),
            ]);

            ObservationResponse::query()
                ->where('silabo_id', $locked->id)
                ->whereNull('revision_respuesta_id')
                ->update(['revision_respuesta_id' => $revision->id, 'actualizado_en' => now()]);
            $from = $locked->estado;
            $action = $from === 'borrador' ? 'enviar' : 'reenviar';
            $locked->update([
                'estado' => 'en_revision',
                'version_bloqueo' => $locked->version_bloqueo + 1,
                'guardado_en' => now(),
            ]);
            $activeRole = $this->roles->resolve($request);
            $this->transitions->execute($locked, $revision, $from, 'en_revision', $action, $actor, $activeRole);
            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: match ($action) {
                    'enviar' => 'silabo.enviado',
                    'reenviar' => 'silabo.reenviado',
                },
                resourceType: 'revision_silabo',
                resourceId: $revision->id,
                result: 'exito',
                metadata: ['revision_number' => $revision->numero_revision, 'fingerprint' => $revision->huella_sha256],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );
            $eventType = $action === 'enviar' ? 'silabo.enviado' : 'silabo.reenviado';
            $this->outbox->execute(
                syllabus: $locked,
                eventType: $eventType,
                deduplicationKey: "{$eventType}:{$revision->id}",
                recipientIds: $this->recipients->coordinatorsFor($locked),
                revisionNumber: $revision->numero_revision,
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $revision;
        });
    }

    private function existingRevision(Syllabus $syllabus, string $key, User $actor): ?SyllabusRevision
    {
        $revision = SyllabusRevision::query()
            ->where('silabo_id', $syllabus->id)
            ->where('clave_idempotencia', $key)
            ->first();
        if ($revision !== null && $revision->enviado_por !== $actor->id) {
            abort(403);
        }

        return $revision;
    }
}
