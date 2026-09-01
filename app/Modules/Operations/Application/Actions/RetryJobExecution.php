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
        return match ($execution->tipo) {
            'documento.exportacion' => $this->retryDocument($execution, $actor, $request),
            'notificacion.interna' => $this->retryNotification($execution, $actor, $request),
            default => throw ValidationException::withMessages([
                'execution' => 'Este tipo de trabajo no admite reintento desde la interfaz.',
            ]),
        };
    }

    private function retryDocument(JobExecution $execution, User $actor, Request $request): JobExecution
    {
        return DB::transaction(function () use ($actor, $execution, $request): JobExecution {
            $artifact = ExportArtifact::query()->lockForUpdate()->find($execution->recurso_id);
            $locked = JobExecution::query()->lockForUpdate()->findOrFail($execution->id);
            if ($artifact === null
                || $locked->tipo !== 'documento.exportacion'
                || $locked->tipo_recurso !== 'artefacto_exportacion'
                || $artifact->ejecucion_trabajo_id !== $locked->id) {
                throw ValidationException::withMessages(['execution' => 'El recurso del trabajo ya no es válido.']);
            }
            if ($locked->estado !== 'fallida' || $artifact->estado !== 'fallido') {
                throw ValidationException::withMessages(['execution' => 'Solo puede reintentarse un trabajo fallido.']);
            }

            $this->resetExecution($locked, $actor, $request);
            $artifact->update(['estado' => 'pendiente']);
            GenerateSyllabusExportJob::dispatch($artifact->id)->afterCommit();

            return $locked->refresh();
        });
    }

    private function retryNotification(JobExecution $execution, User $actor, Request $request): JobExecution
    {
        return DB::transaction(function () use ($actor, $execution, $request): JobExecution {
            $event = OutboxEvent::query()->lockForUpdate()->find($execution->recurso_id);
            $locked = JobExecution::query()->lockForUpdate()->findOrFail($execution->id);
            if ($event === null
                || $locked->tipo !== 'notificacion.interna'
                || $locked->tipo_recurso !== 'evento_saliente'
                || $locked->recurso_id !== $event->id) {
                throw ValidationException::withMessages(['execution' => 'El evento del trabajo ya no es válido.']);
            }
            if ($locked->estado !== 'fallida' || $event->estado !== 'fallido') {
                throw ValidationException::withMessages(['execution' => 'Solo puede reintentarse un trabajo fallido.']);
            }

            $this->resetExecution($locked, $actor, $request);
            $event->update([
                'estado' => 'pendiente',
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
        $previousAttempts = $execution->intentos;
        $previousErrorCode = $execution->codigo_error;
        $execution->update([
            'estado' => 'pendiente',
            'progreso' => 0,
            'resultado' => null,
            'codigo_error' => null,
            'mensaje_error' => null,
            'iniciado_en' => null,
            'finalizado_en' => null,
        ]);
        $activeRole = $this->roles->resolve($request);
        $this->audit->execute(
            actorId: $actor->id,
            roleAssignmentId: $activeRole?->id,
            action: 'trabajo.reintento_solicitado',
            resourceType: 'ejecucion_trabajo',
            resourceId: $execution->id,
            result: 'exito',
            metadata: [
                'job_type' => $execution->tipo,
                'previous_attempts' => $previousAttempts,
                'previous_error_code' => $previousErrorCode,
            ],
            correlationId: $execution->correlacion_id,
        );
    }
}
