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
        $this->onQueue('notificaciones');
    }

    public function handle(): void
    {
        $event = DB::transaction(function (): ?OutboxEvent {
            $locked = OutboxEvent::query()->lockForUpdate()->find($this->eventId);
            if ($locked === null || $locked->estado === 'procesado') {
                return null;
            }
            $execution = $this->execution($locked, true);
            $locked->update([
                'estado' => 'en_proceso',
                'intentos' => $locked->intentos + 1,
                'codigo_error' => null,
                'mensaje_error' => null,
            ]);
            $execution->update([
                'estado' => 'en_ejecucion',
                'intentos' => $execution->intentos + 1,
                'progreso' => 20,
                'iniciado_en' => $execution->iniciado_en ?? now(),
                'finalizado_en' => null,
                'codigo_error' => null,
                'mensaje_error' => null,
            ]);

            return $locked->refresh();
        });
        if ($event === null) {
            return;
        }

        $syllabus = $this->syllabusFor($event);
        [$title, $message] = $this->message($event, $syllabus);
        $recipientIds = $this->recipientIds($event);

        DB::transaction(function () use ($event, $message, $recipientIds, $syllabus, $title): void {
            $locked = OutboxEvent::query()->lockForUpdate()->findOrFail($event->id);
            $execution = $this->execution($locked, true);
            if ($locked->estado === 'procesado') {
                return;
            }
            $activeValues = User::query()
                ->whereIn('id', $recipientIds)
                ->where('activo', true)
                ->pluck('id')
                ->all();
            $activeIds = $this->stringList($activeValues);
            foreach ($activeIds as $recipientId) {
                InternalNotification::query()->firstOrCreate(
                    [
                        'usuario_id' => $recipientId,
                        'clave_deduplicacion' => "flujo:{$locked->id}",
                    ],
                    [
                        'tipo' => $locked->tipo_evento,
                        'titulo' => $title,
                        'mensaje' => $message,
                        'tipo_recurso' => 'silabo',
                        'recurso_id' => $syllabus->id,
                        'notificado_en' => now(),
                    ],
                );
            }
            $locked->update([
                'estado' => 'procesado',
                'procesado_en' => now(),
                'codigo_error' => null,
                'mensaje_error' => null,
            ]);
            $execution->update([
                'estado' => 'completada',
                'progreso' => 100,
                'resultado' => ['event_id' => $locked->id, 'recipient_count' => count($activeIds)],
                'finalizado_en' => now(),
                'codigo_error' => null,
                'mensaje_error' => null,
            ]);
        });
    }

    public function failed(Throwable $exception): void
    {
        DB::transaction(function (): void {
            $event = OutboxEvent::query()->lockForUpdate()->find($this->eventId);
            if ($event === null || $event->estado === 'procesado') {
                return;
            }
            $execution = $this->execution($event, false);
            $event->update([
                'estado' => 'fallido',
                'codigo_error' => 'notificacion_interna_fallida',
                'mensaje_error' => 'No fue posible entregar la notificación interna.',
            ]);
            $execution?->update([
                'estado' => 'fallida',
                'progreso' => 0,
                'resultado' => null,
                'codigo_error' => 'notificacion_interna_fallida',
                'mensaje_error' => 'No fue posible entregar la notificación interna.',
                'finalizado_en' => now(),
            ]);
        });
    }

    /** @return array{string, string} */
    private function message(OutboxEvent $event, Syllabus $syllabus): array
    {
        $revision = $event->contenido['revision_number'] ?? null;
        $revisionLabel = is_int($revision) ? ", revisión {$revision}" : '';

        return match ($event->tipo_evento) {
            'silabo.enviado', 'silabo.reenviado' => [
                'Sílabo listo para revisión',
                "El sílabo {$syllabus->subject->nombre}{$revisionLabel} fue enviado a coordinación.",
            ],
            'silabo.correccion_solicitada' => [
                'Corrección solicitada',
                "Coordinación solicitó corregir el sílabo {$syllabus->subject->nombre}{$revisionLabel}.",
            ],
            'silabo.aprobado' => [
                'Sílabo aprobado',
                "El sílabo {$syllabus->subject->nombre}{$revisionLabel} fue aprobado.",
            ],
            'silabo.reabierto' => [
                'Sílabo reabierto',
                "El sílabo {$syllabus->subject->nombre}{$revisionLabel} fue reabierto para corrección.",
            ],
            'silabo.reiniciado' => [
                'Sílabo reiniciado',
                "Coordinación reinició el sílabo {$syllabus->subject->nombre}. Empiece de nuevo con la malla y la plantilla actuales.",
            ],
            default => throw new RuntimeException('Tipo de notificación interna no soportado.'),
        };
    }

    /** @return list<string> */
    private function recipientIds(OutboxEvent $event): array
    {
        $values = $event->contenido['recipient_ids'] ?? null;
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
            ->where('tipo_recurso', 'evento_saliente')
            ->where('recurso_id', $event->id)
            ->lockForUpdate();

        return $required ? $query->firstOrFail() : $query->first();
    }

    private function syllabusFor(OutboxEvent $event): Syllabus
    {
        return Syllabus::query()->with('subject:id,nombre')->findOrFail($event->agregado_id);
    }
}
