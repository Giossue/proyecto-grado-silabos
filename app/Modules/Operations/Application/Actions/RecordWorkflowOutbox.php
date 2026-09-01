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
        $contenido = [
            'recipient_ids' => array_values(array_unique($recipientIds)),
            'syllabus_id' => $syllabus->id,
            'revision_number' => $revisionNumber,
        ];
        $event = OutboxEvent::query()->firstOrCreate(
            ['clave_deduplicacion' => $deduplicationKey],
            [
                'tipo_agregado' => 'silabo',
                'agregado_id' => $syllabus->id,
                'tipo_evento' => $eventType,
                'contenido' => $contenido,
                'estado' => 'pendiente',
                'intentos' => 0,
                'disponible_en' => now(),
                'ocurrido_en' => now(),
            ],
        );
        if ($event->tipo_agregado !== 'silabo'
            || $event->agregado_id !== $syllabus->id
            || $event->tipo_evento !== $eventType
            || $this->hasher->hash($event->contenido) !== $this->hasher->hash($contenido)) {
            throw new RuntimeException('La clave del evento ya identifica otro cambio de dominio.');
        }

        $execution = JobExecution::query()->firstOrCreate(
            ['clave_idempotencia' => "notificacion.saliente:{$event->id}"],
            [
                'tipo' => 'notificacion.interna',
                'cola' => 'notificaciones',
                'estado' => 'pendiente',
                'correlacion_id' => is_string($correlationId) && Str::isUuid($correlationId)
                    ? $correlationId
                    : (string) Str::uuid(),
                'tipo_recurso' => 'evento_saliente',
                'recurso_id' => $event->id,
                'intentos' => 0,
                'intentos_maximos' => 5,
                'progreso' => 0,
            ],
        );
        if ($execution->tipo_recurso !== 'evento_saliente' || $execution->recurso_id !== $event->id) {
            throw new RuntimeException('La ejecución no coincide con el evento saliente.');
        }
        if ($event->wasRecentlyCreated) {
            DeliverInternalNotificationJob::dispatch($event->id)->afterCommit();
        }

        return $event;
    }
}
