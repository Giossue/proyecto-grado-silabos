<?php

namespace App\Modules\Operations\Application\Actions;

use App\Models\User;
use App\Modules\Documents\Infrastructure\Jobs\GenerateSyllabusExportJob;
use App\Modules\Documents\Infrastructure\Persistence\Models\ExportArtifact;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Infrastructure\Jobs\DeliverInternalNotificationJob;
use App\Modules\Operations\Infrastructure\Persistence\Models\JobExecution;
use App\Modules\Operations\Infrastructure\Persistence\Models\OutboxEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class RetryJobExecution
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    public function execute(JobExecution $execution, User $actor, Request $request): JobExecution
    {
        return match ($execution->type) {
            'document.export' => $this->retryDocument($execution, $actor, $request),
            'notification.internal' => $this->retryNotification($execution, $actor, $request),
            default => throw ValidationException::withMessages([
                'execution' => 'Este tipo de trabajo no admite reintento desde la interfaz.',
            ]),
        };
    }

    private function retryDocument(JobExecution $execution, User $actor, Request $request): JobExecution
    {
        return DB::transaction(function () use ($actor, $execution, $request): JobExecution {
            $artifact = ExportArtifact::query()->lockForUpdate()->find($execution->resource_id);
            $locked = JobExecution::query()->lockForUpdate()->findOrFail($execution->id);
            if ($artifact === null
                || $locked->type !== 'document.export'
                || $locked->resource_type !== 'export_artifact'
                || $artifact->ejecucion_trabajo_id !== $locked->id) {
                throw ValidationException::withMessages(['execution' => 'El recurso del trabajo ya no es válido.']);
            }
            if ($locked->status !== 'failed' || $artifact->estado !== 'failed') {
                throw ValidationException::withMessages(['execution' => 'Solo puede reintentarse un trabajo fallido.']);
            }

            $this->resetExecution($locked, $actor, $request);
            $artifact->update(['estado' => 'pending']);
            GenerateSyllabusExportJob::dispatch($artifact->id)->afterCommit();

            return $locked->refresh();
        });
    }

    private function retryNotification(JobExecution $execution, User $actor, Request $request): JobExecution
    {
        return DB::transaction(function () use ($actor, $execution, $request): JobExecution {
            $event = OutboxEvent::query()->lockForUpdate()->find($execution->resource_id);
            $locked = JobExecution::query()->lockForUpdate()->findOrFail($execution->id);
            if ($event === null
                || $locked->type !== 'notification.internal'
                || $locked->resource_type !== 'outbox_event'
                || $locked->resource_id !== $event->id) {
                throw ValidationException::withMessages(['execution' => 'El evento del trabajo ya no es válido.']);
            }
            if ($locked->status !== 'failed' || $event->estado !== 'failed') {
                throw ValidationException::withMessages(['execution' => 'Solo puede reintentarse un trabajo fallido.']);
            }

            $this->resetExecution($locked, $actor, $request);
            $event->update([
                'estado' => 'pending',
                'disponible_en' => now(),
                'procesado_en' => null,
                'codigo_error' => null,
                'mensaje_error' => null,
            ]);
            DeliverInternalNotificationJob::dispatch($event->id)->afterCommit();

            return $locked->refresh();
        });
    }

    private function resetExecution(JobExecution $execution, User $actor, Request $request): void
    {
        $previousAttempts = $execution->attempts;
        $previousErrorCode = $execution->error_code;
        $execution->update([
            'status' => 'pending',
            'progress' => 0,
            'result' => null,
            'error_code' => null,
            'error_message' => null,
            'started_at' => null,
            'finished_at' => null,
        ]);
        $activeRole = $this->roles->resolve($request);
        $this->audit->execute(
            actorId: $actor->id,
            roleAssignmentId: $activeRole?->id,
            action: 'job.retry_requested',
            resourceType: 'job_execution',
            resourceId: $execution->id,
            result: 'success',
            metadata: [
                'job_type' => $execution->type,
                'previous_attempts' => $previousAttempts,
                'previous_error_code' => $previousErrorCode,
            ],
            correlationId: $execution->correlation_id,
        );
    }
}
