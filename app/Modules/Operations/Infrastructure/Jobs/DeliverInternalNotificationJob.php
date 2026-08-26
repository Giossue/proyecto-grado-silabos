<?php

namespace App\Modules\Operations\Infrastructure\Jobs;

use App\Models\User;
use App\Modules\Operations\Infrastructure\Persistence\Models\InternalNotification;
use App\Modules\Operations\Infrastructure\Persistence\Models\JobExecution;
use App\Modules\Operations\Infrastructure\Persistence\Models\OutboxEvent;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Throwable;

class DeliverInternalNotificationJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 5;

    public int $timeout = 30;

    /** @var list<int> */
    public array $backoff = [5, 30, 120, 300];

    public function __construct(public readonly string $eventId)
    {
        $this->onQueue('notifications');
    }

    public function handle(): void
    {
        $event = DB::transaction(function (): ?OutboxEvent {
            $locked = OutboxEvent::query()->lockForUpdate()->find($this->eventId);
            if ($locked === null || $locked->estado === 'processed') {
                return null;
            }
            $execution = $this->execution($locked, true);
            $locked->update([
                'estado' => 'processing',
                'intentos' => $locked->intentos + 1,
                'codigo_error' => null,
                'mensaje_error' => null,
            ]);
            $execution->update([
                'status' => 'running',
                'attempts' => $execution->attempts + 1,
                'progress' => 20,
                'started_at' => $execution->started_at ?? now(),
                'finished_at' => null,
                'error_code' => null,
                'error_message' => null,
            ]);

            return $locked->refresh();
        });
        if ($event === null) {
            return;
        }

        $syllabus = Syllabus::query()->with('subject:id,nombre')->findOrFail($event->agregado_id);
        [$title, $message] = $this->message($event, $syllabus);
        $recipientIds = $this->recipientIds($event);

        DB::transaction(function () use ($event, $message, $recipientIds, $syllabus, $title): void {
            $locked = OutboxEvent::query()->lockForUpdate()->findOrFail($event->id);
            $execution = $this->execution($locked, true);
            if ($locked->estado === 'processed') {
                return;
            }
            $activeValues = User::query()
                ->whereIn('id', $recipientIds)
                ->where('active', true)
                ->pluck('id')
                ->all();
            $activeIds = $this->stringList($activeValues);
            foreach ($activeIds as $recipientId) {
                InternalNotification::query()->firstOrCreate(
                    [
                        'usuario_id' => $recipientId,
                        'clave_deduplicacion' => "workflow:{$locked->id}",
                    ],
                    [
                        'tipo' => $locked->tipo_evento,
                        'titulo' => $title,
                        'mensaje' => $message,
                        'tipo_recurso' => 'syllabus',
                        'recurso_id' => $syllabus->id,
                        'creado_en' => now(),
                    ],
                );
            }
            $locked->update([
                'estado' => 'processed',
                'procesado_en' => now(),
                'codigo_error' => null,
                'mensaje_error' => null,
            ]);
            $execution->update([
                'status' => 'completed',
                'progress' => 100,
                'result' => ['event_id' => $locked->id, 'recipient_count' => count($activeIds)],
                'finished_at' => now(),
                'error_code' => null,
                'error_message' => null,
            ]);
        });
    }

    public function failed(Throwable $exception): void
    {
        DB::transaction(function (): void {
            $event = OutboxEvent::query()->lockForUpdate()->find($this->eventId);
            if ($event === null || $event->estado === 'processed') {
                return;
            }
            $execution = $this->execution($event, false);
            $event->update([
                'estado' => 'failed',
                'codigo_error' => 'internal_notification_failed',
                'mensaje_error' => 'No fue posible entregar la notificación interna.',
            ]);
            $execution?->update([
                'status' => 'failed',
                'progress' => 0,
                'result' => null,
                'error_code' => 'internal_notification_failed',
                'error_message' => 'No fue posible entregar la notificación interna.',
                'finished_at' => now(),
            ]);
        });
    }

    /** @return array{string, string} */
    private function message(OutboxEvent $event, Syllabus $syllabus): array
    {
        $revision = $event->payload['revision_number'] ?? null;
        $revisionLabel = is_int($revision) ? ", revisión {$revision}" : '';

        return match ($event->tipo_evento) {
            'syllabus.submitted', 'syllabus.resubmitted' => [
                'Sílabo listo para revisión',
                "El sílabo {$syllabus->subject->nombre}{$revisionLabel} fue enviado a coordinación.",
            ],
            'syllabus.correction_requested' => [
                'Corrección solicitada',
                "Coordinación solicitó corregir el sílabo {$syllabus->subject->nombre}{$revisionLabel}.",
            ],
            'syllabus.approved' => [
                'Sílabo aprobado',
                "El sílabo {$syllabus->subject->nombre}{$revisionLabel} fue aprobado.",
            ],
            'syllabus.reopened' => [
                'Sílabo reabierto',
                "El sílabo {$syllabus->subject->nombre}{$revisionLabel} fue reabierto para corrección.",
            ],
            default => throw new RuntimeException('Tipo de notificación interna no soportado.'),
        };
    }

    /** @return list<string> */
    private function recipientIds(OutboxEvent $event): array
    {
        $values = $event->payload['recipient_ids'] ?? null;
        if (! is_array($values)) {
            throw new RuntimeException('El evento no contiene destinatarios válidos.');
        }

        return array_values(array_unique(array_filter($values, is_string(...))));
    }

    /**
     * @param  iterable<mixed>  $values
     * @return list<string>
     */
    private function stringList(iterable $values): array
    {
        $strings = [];
        foreach ($values as $value) {
            if (is_string($value)) {
                $strings[] = $value;
            }
        }

        return array_values(array_unique($strings));
    }

    private function execution(OutboxEvent $event, bool $required): ?JobExecution
    {
        $query = JobExecution::query()
            ->where('resource_type', 'outbox_event')
            ->where('resource_id', $event->id)
            ->lockForUpdate();

        return $required ? $query->firstOrFail() : $query->first();
    }
}
