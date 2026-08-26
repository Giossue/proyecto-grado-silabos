<?php

namespace App\Modules\Operations\Application\Actions;

use App\Modules\Operations\Infrastructure\Jobs\DeliverInternalNotificationJob;
use App\Modules\Operations\Infrastructure\Persistence\Models\JobExecution;
use App\Modules\Operations\Infrastructure\Persistence\Models\OutboxEvent;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Support\CanonicalHasher;
use Illuminate\Support\Str;
use RuntimeException;

class RecordWorkflowOutbox
{
    public function __construct(private readonly CanonicalHasher $hasher) {}

    /** @param list<string> $recipientIds */
    public function execute(
        Syllabus $syllabus,
        string $eventType,
        string $deduplicationKey,
        array $recipientIds,
        ?int $revisionNumber,
        ?string $correlationId,
    ): OutboxEvent {
        $payload = [
            'recipient_ids' => array_values(array_unique($recipientIds)),
            'syllabus_id' => $syllabus->id,
            'revision_number' => $revisionNumber,
        ];
        $event = OutboxEvent::query()->firstOrCreate(
            ['clave_deduplicacion' => $deduplicationKey],
            [
                'tipo_agregado' => 'syllabus',
                'agregado_id' => $syllabus->id,
                'tipo_evento' => $eventType,
                'payload' => $payload,
                'estado' => 'pending',
                'intentos' => 0,
                'disponible_en' => now(),
                'ocurrido_en' => now(),
            ],
        );
        if ($event->tipo_agregado !== 'syllabus'
            || $event->agregado_id !== $syllabus->id
            || $event->tipo_evento !== $eventType
            || $this->hasher->hash($event->payload) !== $this->hasher->hash($payload)) {
            throw new RuntimeException('La clave del evento ya identifica otro cambio de dominio.');
        }

        $execution = JobExecution::query()->firstOrCreate(
            ['idempotency_key' => "notification.outbox:{$event->id}"],
            [
                'type' => 'notification.internal',
                'queue_name' => 'notifications',
                'status' => 'pending',
                'correlation_id' => is_string($correlationId) && Str::isUuid($correlationId)
                    ? $correlationId
                    : (string) Str::uuid(),
                'resource_type' => 'outbox_event',
                'resource_id' => $event->id,
                'attempts' => 0,
                'max_attempts' => 5,
                'progress' => 0,
            ],
        );
        if ($execution->resource_type !== 'outbox_event' || $execution->resource_id !== $event->id) {
            throw new RuntimeException('La ejecución no coincide con el evento outbox.');
        }
        if ($event->wasRecentlyCreated) {
            DeliverInternalNotificationJob::dispatch($event->id)->afterCommit();
        }

        return $event;
    }
}
