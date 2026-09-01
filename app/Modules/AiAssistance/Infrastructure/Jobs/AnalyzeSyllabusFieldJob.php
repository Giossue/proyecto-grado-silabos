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

    /**
     * El contrato del gateway habla inglés (PV-13/14); la BD almacena español.
     * La traducción ocurre únicamente en el punto de persistencia.
     *
     * @var array<string, string>
     */
    private const MOTIVOS_NO_CONCLUYENTE = [
        'evidence_limit_exceeded' => 'limite_evidencia_excedido',
        'insufficient_evidence' => 'evidencia_insuficiente',
        'empty_content' => 'contenido_vacio',
        'no_editorial_change' => 'sin_cambio_editorial',
    ];

    /** @var array<string, string> */
    private const TIPOS_RECOMENDACION = [
        'clarity' => 'claridad',
        'consistency' => 'consistencia',
    ];

    public function __construct(public readonly string $executionId)
    {
        $this->onQueue('ia');
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
                'contrato_ia_invalido',
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
            if (in_array($execution->estado, ['completada', 'no_concluyente', 'fallida'], true)) {
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
                'estado' => 'completada',
                'version_pasarela_ejecutada' => $result->gatewayVersion,
                'completado_en' => now(),
            ]);
            $job = JobExecution::query()->lockForUpdate()->findOrFail($execution->ejecucion_trabajo_id);
            $job->update([
                'estado' => 'completada',
                'progreso' => 100,
                'resultado' => [
                    'ai_execution_id' => $execution->id,
                    'status' => 'completed',
                    'recommendation_count' => count($result->recommendations),
                ],
                'finalizado_en' => now(),
                'codigo_error' => null,
                'mensaje_error' => null,
            ]);
            $this->notify($execution, 'completada');
            $audit->execute(
                actorId: null,
                roleAssignmentId: null,
                action: 'ia.analisis_completado',
                resourceType: 'ejecucion_ia',
                resourceId: $execution->id,
                result: 'exito',
                metadata: [
                    'gateway_version' => $result->gatewayVersion,
                    'recommendation_count' => count($result->recommendations),
                ],
                correlationId: $job->correlacion_id,
            );
        });
    }

    public function failed(Throwable $exception): void
    {
        $code = $exception instanceof AiGatewayUnavailable
            ? 'servicio_ia_no_disponible'
            : 'analisis_ia_fallido';
        $message = $exception instanceof AiGatewayUnavailable
            ? 'La ayuda de IA no está disponible por el momento. Puede continuar editando y volver a solicitarla.'
            : 'No fue posible completar la ayuda de IA. El borrador no fue modificado.';
        $this->finishFailed($code, $message, app(RecordAuditEvent::class));
    }

    private function markRunning(): bool
    {
        return DB::transaction(function (): bool {
            $execution = AiExecution::query()->lockForUpdate()->find($this->executionId);
            if ($execution === null || in_array($execution->estado, ['completada', 'no_concluyente', 'fallida'], true)) {
                return false;
            }
            $job = JobExecution::query()->lockForUpdate()->findOrFail($execution->ejecucion_trabajo_id);
            $execution->update(['estado' => 'en_ejecucion', 'iniciado_en' => $execution->iniciado_en ?? now()]);
            $job->update([
                'estado' => 'en_ejecucion',
                'intentos' => $job->intentos + 1,
                'progreso' => 15,
                'iniciado_en' => $job->iniciado_en ?? now(),
                'finalizado_en' => null,
                'codigo_error' => null,
                'mensaje_error' => null,
            ]);

            return true;
        });
    }

    private function finishInconclusive(string $reason, string $gatewayVersion, RecordAuditEvent $audit): void
    {
        DB::transaction(function () use ($audit, $gatewayVersion, $reason): void {
            $execution = AiExecution::query()->lockForUpdate()->findOrFail($this->executionId);
            if (in_array($execution->estado, ['completada', 'no_concluyente', 'fallida'], true)) {
                return;
            }
            // `$reason` llega en el vocabulario del contrato; se traduce al persistir.
            $motivo = self::MOTIVOS_NO_CONCLUYENTE[$reason] ?? $reason;
            $execution->update([
                'estado' => 'no_concluyente',
                'version_pasarela_ejecutada' => $gatewayVersion,
                'motivo_no_concluyente' => $motivo,
                'completado_en' => now(),
            ]);
            $job = JobExecution::query()->lockForUpdate()->findOrFail($execution->ejecucion_trabajo_id);
            $job->update([
                'estado' => 'completada',
                'progreso' => 100,
                'resultado' => ['ai_execution_id' => $execution->id, 'status' => 'inconclusive', 'reason' => $reason],
                'finalizado_en' => now(),
                'codigo_error' => null,
                'mensaje_error' => null,
            ]);
            $this->notify($execution, 'no_concluyente');
            $audit->execute(
                actorId: null,
                roleAssignmentId: null,
                action: 'ia.analisis_no_concluyente',
                resourceType: 'ejecucion_ia',
                resourceId: $execution->id,
                result: 'exito',
                metadata: ['reason' => $reason, 'gateway_version' => $gatewayVersion],
                correlationId: $job->correlacion_id,
            );
        });
    }

    private function finishFailed(string $code, string $message, RecordAuditEvent $audit): void
    {
        DB::transaction(function () use ($audit, $code, $message): void {
            $execution = AiExecution::query()->lockForUpdate()->find($this->executionId);
            if ($execution === null || in_array($execution->estado, ['completada', 'no_concluyente', 'fallida'], true)) {
                return;
            }
            $execution->update([
                'estado' => 'fallida',
                'codigo_error' => $code,
                'mensaje_error' => $message,
                'completado_en' => now(),
            ]);
            $job = JobExecution::query()->lockForUpdate()->find($execution->ejecucion_trabajo_id);
            if ($job !== null) {
                $job->update([
                    'estado' => 'fallida',
                    'progreso' => 0,
                    'resultado' => null,
                    'codigo_error' => $code,
                    'mensaje_error' => $message,
                    'finalizado_en' => now(),
                ]);
                $audit->execute(
                    actorId: null,
                    roleAssignmentId: null,
                    action: 'ia.analisis_fallido',
                    resourceType: 'ejecucion_ia',
                    resourceId: $execution->id,
                    result: 'fallido',
                    metadata: ['error_code' => $code],
                    correlationId: $job->correlacion_id,
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
            $execution->idioma,
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
            // El contrato emite `clarity`/`consistency`; la BD guarda español.
            'tipo' => self::TIPOS_RECOMENDACION[$output->type] ?? $output->type,
            'titulo' => $output->title,
            'explicacion' => $output->explanation,
            'texto_sugerido' => $output->suggestedText,
        ]);
    }

    private function notify(AiExecution $execution, string $estado): void
    {
        InternalNotification::query()->firstOrCreate(
            [
                'usuario_id' => $execution->solicitado_por,
                'clave_deduplicacion' => "ia.analisis.{$estado}:{$execution->id}",
            ],
            [
                'tipo' => "ia.analisis.{$estado}",
                'titulo' => $estado === 'completada' ? 'Recomendación de IA disponible' : 'Análisis de IA no concluyente',
                'mensaje' => $estado === 'completada'
                    ? 'La ayuda solicitada está lista para revisión. Ningún cambio se aplicó automáticamente.'
                    : 'La ayuda no produjo recomendaciones verificables. Puede continuar trabajando normalmente.',
                'tipo_recurso' => 'ejecucion_ia',
                'recurso_id' => $execution->id,
                'creado_en' => now(),
            ],
        );
    }
}
