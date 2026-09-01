<?php

namespace App\Modules\AiAssistance\Infrastructure\Jobs;

use App\Modules\AiAssistance\Application\AiResultContract;
use App\Modules\AiAssistance\Domain\Contracts\AiAnalysisGateway;
use App\Modules\AiAssistance\Domain\Data\AiAnalysisInput;
use App\Modules\AiAssistance\Domain\Data\AiEvidenceInput;
use App\Modules\AiAssistance\Domain\Data\AiRecommendationOutput;
use App\Modules\AiAssistance\Domain\Exceptions\AiContractException;
use App\Modules\AiAssistance\Domain\Exceptions\AiGatewayUnavailable;
use App\Modules\AiAssistance\Infrastructure\Persistence\Models\AiExecution;
use App\Modules\AiAssistance\Infrastructure\Persistence\Models\AiRecommendation;
use App\Modules\AiAssistance\Infrastructure\Persistence\Models\AiRecommendationEvidence;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Operations\Infrastructure\Persistence\Models\InternalNotification;
use App\Modules\Operations\Infrastructure\Persistence\Models\JobExecution;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Throwable;

class AnalyzeSyllabusFieldJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public int $timeout = 60;

    /** @var list<int> */
    public array $backoff = [5, 30, 120];

    public function __construct(public readonly string $executionId)
    {
        $this->onQueue('ai');
    }

    public function handle(
        AiAnalysisGateway $gateway,
        AiResultContract $contract,
        RecordAuditEvent $audit,
    ): void {
        if (! $this->markRunning()) {
            return;
        }

        $execution = AiExecution::query()
            ->with(['field', 'evidence'])
            ->findOrFail($this->executionId);
        $metadata = $execution->metadatos_entrada;
        if (($metadata['too_many_evidence'] ?? false) === true) {
            $this->finishInconclusive('evidence_limit_exceeded', $gateway->version(), $audit);

            return;
        }
        if ($execution->evidence->isEmpty()) {
            $this->finishInconclusive('insufficient_evidence', $gateway->version(), $audit);

            return;
        }

        $input = $this->input($execution);
        try {
            $result = $gateway->analyze($input);
            $contract->validate($input, $result);
        } catch (AiContractException) {
            $this->finishFailed(
                'ai_contract_invalid',
                'El servicio devolvió una respuesta que no pudo verificarse. El borrador no fue modificado.',
                $audit,
            );

            return;
        } catch (AiGatewayUnavailable $exception) {
            throw $exception;
        }

        if ($result->status === 'inconclusive') {
            $this->finishInconclusive(
                $result->inconclusiveReason ?? 'insufficient_evidence',
                $result->gatewayVersion,
                $audit,
            );

            return;
        }

        DB::transaction(function () use ($audit, $result): void {
            $execution = AiExecution::query()->with('evidence')->lockForUpdate()->findOrFail($this->executionId);
            if (in_array($execution->estado, ['completed', 'inconclusive', 'failed'], true)) {
                return;
            }
            $evidenceById = $execution->evidence->keyBy('id');
            foreach ($result->recommendations as $index => $output) {
                $recommendation = $this->persistRecommendation($execution, $output, $index + 1);
                foreach (array_unique($output->evidenceIds) as $evidenceId) {
                    if ($evidenceById->has($evidenceId)) {
                        AiRecommendationEvidence::query()->create([
                            'recomendacion_ia_id' => $recommendation->id,
                            'evidencia_ia_id' => $evidenceId,
                        ]);
                    }
                }
            }
            $execution->update([
                'estado' => 'completed',
                'version_gateway_ejecutada' => $result->gatewayVersion,
                'completado_en' => now(),
            ]);
            $job = JobExecution::query()->lockForUpdate()->findOrFail($execution->ejecucion_trabajo_id);
            $job->update([
                'status' => 'completed',
                'progress' => 100,
                'result' => [
                    'ai_execution_id' => $execution->id,
                    'status' => 'completed',
                    'recommendation_count' => count($result->recommendations),
                ],
                'finished_at' => now(),
                'error_code' => null,
                'error_message' => null,
            ]);
            $this->notify($execution, 'completed');
            $audit->execute(
                actorId: null,
                roleAssignmentId: null,
                action: 'ai.analysis_completed',
                resourceType: 'ai_execution',
                resourceId: $execution->id,
                result: 'success',
                metadata: [
                    'gateway_version' => $result->gatewayVersion,
                    'recommendation_count' => count($result->recommendations),
                ],
                correlationId: $job->correlation_id,
            );
        });
    }

    public function failed(Throwable $exception): void
    {
        $code = $exception instanceof AiGatewayUnavailable
            ? 'ai_service_unavailable'
            : 'ai_analysis_failed';
        $message = $exception instanceof AiGatewayUnavailable
            ? 'La ayuda de IA no está disponible por el momento. Puede continuar editando y volver a solicitarla.'
            : 'No fue posible completar la ayuda de IA. El borrador no fue modificado.';
        $this->finishFailed($code, $message, app(RecordAuditEvent::class));
    }

    private function markRunning(): bool
    {
        return DB::transaction(function (): bool {
            $execution = AiExecution::query()->lockForUpdate()->find($this->executionId);
            if ($execution === null || in_array($execution->estado, ['completed', 'inconclusive', 'failed'], true)) {
                return false;
            }
            $job = JobExecution::query()->lockForUpdate()->findOrFail($execution->ejecucion_trabajo_id);
            $execution->update(['estado' => 'running', 'iniciado_en' => $execution->iniciado_en ?? now()]);
            $job->update([
                'status' => 'running',
                'attempts' => $job->attempts + 1,
                'progress' => 15,
                'started_at' => $job->started_at ?? now(),
                'finished_at' => null,
                'error_code' => null,
                'error_message' => null,
            ]);

            return true;
        });
    }

    private function finishInconclusive(string $reason, string $gatewayVersion, RecordAuditEvent $audit): void
    {
        DB::transaction(function () use ($audit, $gatewayVersion, $reason): void {
            $execution = AiExecution::query()->lockForUpdate()->findOrFail($this->executionId);
            if (in_array($execution->estado, ['completed', 'inconclusive', 'failed'], true)) {
                return;
            }
            $execution->update([
                'estado' => 'inconclusive',
                'version_gateway_ejecutada' => $gatewayVersion,
                'motivo_no_concluyente' => $reason,
                'completado_en' => now(),
            ]);
            $job = JobExecution::query()->lockForUpdate()->findOrFail($execution->ejecucion_trabajo_id);
            $job->update([
                'status' => 'completed',
                'progress' => 100,
                'result' => ['ai_execution_id' => $execution->id, 'status' => 'inconclusive', 'reason' => $reason],
                'finished_at' => now(),
                'error_code' => null,
                'error_message' => null,
            ]);
            $this->notify($execution, 'inconclusive');
            $audit->execute(
                actorId: null,
                roleAssignmentId: null,
                action: 'ai.analysis_inconclusive',
                resourceType: 'ai_execution',
                resourceId: $execution->id,
                result: 'success',
                metadata: ['reason' => $reason, 'gateway_version' => $gatewayVersion],
                correlationId: $job->correlation_id,
            );
        });
    }

    private function finishFailed(string $code, string $message, RecordAuditEvent $audit): void
    {
        DB::transaction(function () use ($audit, $code, $message): void {
            $execution = AiExecution::query()->lockForUpdate()->find($this->executionId);
            if ($execution === null || in_array($execution->estado, ['completed', 'inconclusive', 'failed'], true)) {
                return;
            }
            $execution->update([
                'estado' => 'failed',
                'codigo_error' => $code,
                'mensaje_error' => $message,
                'completado_en' => now(),
            ]);
            $job = JobExecution::query()->lockForUpdate()->find($execution->ejecucion_trabajo_id);
            if ($job !== null) {
                $job->update([
                    'status' => 'failed',
                    'progress' => 0,
                    'result' => null,
                    'error_code' => $code,
                    'error_message' => $message,
                    'finished_at' => now(),
                ]);
                $audit->execute(
                    actorId: null,
                    roleAssignmentId: null,
                    action: 'ai.analysis_failed',
                    resourceType: 'ai_execution',
                    resourceId: $execution->id,
                    result: 'failed',
                    metadata: ['error_code' => $code],
                    correlationId: $job->correlation_id,
                );
            }
        });
    }

    private function input(AiExecution $execution): AiAnalysisInput
    {
        $evidence = [];
        foreach ($execution->evidence as $item) {
            $evidence[] = new AiEvidenceInput(
                $item->id,
                $item->fuente_academica_id,
                $item->nombre_fuente,
                $item->extracto,
                $item->huella_contenido,
            );
        }

        return new AiAnalysisInput(
            $execution->id,
            $execution->version_contrato,
            $execution->version_instruccion,
            $execution->field->clave,
            $execution->field->etiqueta,
            $execution->contenido_entrada,
            $execution->huella_contenido,
            $execution->locale,
            $evidence,
            (int) config('ai.limits.recommendations'),
        );
    }

    private function persistRecommendation(
        AiExecution $execution,
        AiRecommendationOutput $output,
        int $ordinal,
    ): AiRecommendation {
        return AiRecommendation::query()->create([
            'ejecucion_ia_id' => $execution->id,
            'definicion_campo_id' => $execution->definicion_campo_id,
            'ordinal' => $ordinal,
            'tipo' => $output->type,
            'titulo' => $output->title,
            'explicacion' => $output->explanation,
            'texto_sugerido' => $output->suggestedText,
        ]);
    }

    private function notify(AiExecution $execution, string $status): void
    {
        InternalNotification::query()->firstOrCreate(
            [
                'usuario_id' => $execution->solicitado_por,
                'clave_deduplicacion' => "ai.analysis.{$status}:{$execution->id}",
            ],
            [
                'tipo' => "ai.analysis.{$status}",
                'titulo' => $status === 'completed' ? 'Recomendación de IA disponible' : 'Análisis de IA no concluyente',
                'mensaje' => $status === 'completed'
                    ? 'La ayuda solicitada está lista para revisión. Ningún cambio se aplicó automáticamente.'
                    : 'La ayuda no produjo recomendaciones verificables. Puede continuar trabajando normalmente.',
                'tipo_recurso' => 'ai_execution',
                'recurso_id' => $execution->id,
                'creado_en' => now(),
            ],
        );
    }
}
