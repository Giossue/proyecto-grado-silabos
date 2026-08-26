<?php

namespace App\Modules\Integrations\Infrastructure\Jobs;

use App\Modules\Integrations\Domain\Contracts\AcademicRecordMapper;
use App\Modules\Integrations\Domain\Contracts\ImportReconciler;
use App\Modules\Integrations\Domain\Contracts\InstitutionalDataReader;
use App\Modules\Integrations\Domain\Data\InstitutionalBatch;
use App\Modules\Integrations\Domain\Data\InstitutionalRecord;
use App\Modules\Integrations\Domain\Data\MappingResult;
use App\Modules\Integrations\Domain\Data\ReconciliationProposal;
use App\Modules\Integrations\Domain\Exceptions\ImportContractException;
use App\Modules\Integrations\Domain\Exceptions\InstitutionalReaderUnavailable;
use App\Modules\Integrations\Infrastructure\Persistence\Models\ImportConflict;
use App\Modules\Integrations\Infrastructure\Persistence\Models\ImportExecution;
use App\Modules\Integrations\Infrastructure\Persistence\Models\ImportItem;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Operations\Infrastructure\Persistence\Models\InternalNotification;
use App\Modules\Operations\Infrastructure\Persistence\Models\JobExecution;
use App\Support\CanonicalHasher;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use JsonException;
use Throwable;

/**
 * @phpstan-type PreparedItem array{
 *   row: int,
 *   external_reference: string,
 *   entity_type: string,
 *   raw: array<string, mixed>,
 *   raw_fingerprint: string,
 *   normalized: array<string, bool|float|int|string>|null,
 *   normalized_fingerprint: string|null,
 *   result: string,
 *   proposed_action: string|null,
 *   reason: string,
 *   candidate_type: string|null,
 *   candidate_id: string|null,
 *   candidate_ids: list<string>
 * }
 */
class SimulateInstitutionalImportJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public int $timeout = 120;

    /** @var list<int> */
    public array $backoff = [5, 30, 120];

    public function __construct(public readonly string $executionId)
    {
        $this->onQueue('integrations');
    }

    public function handle(
        InstitutionalDataReader $reader,
        AcademicRecordMapper $mapper,
        ImportReconciler $reconciler,
        CanonicalHasher $hasher,
        RecordAuditEvent $audit,
    ): void {
        if (! $this->markRunning()) {
            return;
        }

        $execution = ImportExecution::query()->findOrFail($this->executionId);
        try {
            $this->assertPinnedImplementations($execution, $reader, $mapper, $reconciler);
            $batch = $reader->read($execution->perfil);
            [$records, $inputFingerprint] = $this->validatedBatch($batch, $execution, $hasher);
            $prepared = $this->prepare($records, $mapper, $reconciler, $hasher);
        } catch (InstitutionalReaderUnavailable $exception) {
            throw $exception;
        } catch (ImportContractException|JsonException) {
            $this->finishFailed(
                'import_contract_invalid',
                'El lote institucional no cumple el contrato verificable. Ningún catálogo académico fue modificado.',
                $audit,
            );

            return;
        }

        $this->persistCompleted($prepared, $inputFingerprint, $reader->version(), $audit);
    }

    public function failed(Throwable $exception): void
    {
        $code = $exception instanceof InstitutionalReaderUnavailable
            ? 'institutional_reader_unavailable'
            : 'institutional_import_failed';
        $message = $exception instanceof InstitutionalReaderUnavailable
            ? 'La fuente institucional no está disponible por el momento. Ningún catálogo académico fue modificado.'
            : 'No fue posible completar la simulación. Ningún catálogo académico fue modificado.';
        $this->finishFailed($code, $message, app(RecordAuditEvent::class));
    }

    private function markRunning(): bool
    {
        return DB::transaction(function (): bool {
            $execution = ImportExecution::query()->lockForUpdate()->find($this->executionId);
            if ($execution === null || in_array($execution->estado, ['completed', 'failed'], true)) {
                return false;
            }
            $job = JobExecution::query()->lockForUpdate()->findOrFail($execution->ejecucion_trabajo_id);
            $execution->update([
                'estado' => 'running',
                'iniciado_en' => $execution->iniciado_en ?? now(),
            ]);
            $job->update([
                'status' => 'running',
                'attempts' => $job->attempts + 1,
                'progress' => 10,
                'started_at' => $job->started_at ?? now(),
                'finished_at' => null,
                'error_code' => null,
                'error_message' => null,
            ]);

            return true;
        });
    }

    private function assertPinnedImplementations(
        ImportExecution $execution,
        InstitutionalDataReader $reader,
        AcademicRecordMapper $mapper,
        ImportReconciler $reconciler,
    ): void {
        if ($execution->modo !== 'simulation'
            || $execution->version_contrato !== (string) config('integrations.institutional_import.contract_version')
            || $execution->origen !== $reader->source()
            || $execution->version_lector_solicitada !== $reader->version()
            || $execution->version_mapper !== $mapper->version()
            || $execution->version_reconciliador !== $reconciler->version()) {
            throw new ImportContractException('Las versiones fijadas de importación no coinciden.');
        }
    }

    /** @return array{0: list<InstitutionalRecord>, 1: string} */
    private function validatedBatch(
        InstitutionalBatch $batch,
        ImportExecution $execution,
        CanonicalHasher $hasher,
    ): array {
        if ($batch->source !== $execution->origen
            || $batch->readerVersion !== $execution->version_lector_solicitada
            || $batch->profile !== $execution->perfil) {
            throw new ImportContractException('El lote no corresponde a la solicitud fijada.');
        }
        $limit = (int) config('integrations.institutional_import.limits.records_per_batch');
        if ($batch->records === [] || count($batch->records) > $limit) {
            throw new ImportContractException('La cantidad de filas está fuera del límite.');
        }

        $records = [];
        $seenRows = [];
        $fingerprintRows = [];
        $recordByteLimit = (int) config('integrations.institutional_import.limits.record_bytes');
        foreach ($batch->records as $record) {
            if ($record->rowNumber < 1
                || isset($seenRows[$record->rowNumber])
                || ! mb_check_encoding($record->externalReference, 'UTF-8')
                || ! mb_check_encoding($record->entityType, 'UTF-8')
                || mb_strlen($record->externalReference) > 180
                || mb_strlen($record->entityType) > 60) {
                throw new ImportContractException('Una fila no cumple la estructura del contrato.');
            }
            $seenRows[$record->rowNumber] = true;
            $canonical = $hasher->json([
                'row' => $record->rowNumber,
                'external_reference' => $record->externalReference,
                'entity_type' => $record->entityType,
                'payload' => $record->payload,
            ]);
            if (strlen($canonical) > $recordByteLimit) {
                throw new ImportContractException('Una fila excede el límite de tamaño.');
            }
            $records[] = $record;
        }
        usort($records, fn (InstitutionalRecord $left, InstitutionalRecord $right): int => $left->rowNumber <=> $right->rowNumber);
        foreach ($records as $record) {
            $fingerprintRows[] = [
                'row' => $record->rowNumber,
                'external_reference' => $record->externalReference,
                'entity_type' => $record->entityType,
                'payload' => $record->payload,
            ];
        }
        $canonicalBatch = $hasher->json([
            'source' => $batch->source,
            'reader_version' => $batch->readerVersion,
            'profile' => $batch->profile,
            'records' => $fingerprintRows,
        ]);
        if (strlen($canonicalBatch) > (int) config('integrations.institutional_import.limits.batch_bytes')) {
            throw new ImportContractException('El lote excede el límite de tamaño.');
        }

        return [$records, hash('sha256', $canonicalBatch)];
    }

    /**
     * @param  list<InstitutionalRecord>  $records
     * @return list<PreparedItem>
     */
    private function prepare(
        array $records,
        AcademicRecordMapper $mapper,
        ImportReconciler $reconciler,
        CanonicalHasher $hasher,
    ): array {
        /** @var list<array{record: InstitutionalRecord, mapping: MappingResult}> $mapped */
        $mapped = [];
        /** @var array<string, int> $referenceCounts */
        $referenceCounts = [];
        foreach ($records as $record) {
            $mapping = $mapper->map($record);
            $this->assertMappingResult($mapping);
            $mapped[] = ['record' => $record, 'mapping' => $mapping];
            if ($mapping->valid) {
                $referenceCounts[$record->externalReference] = ($referenceCounts[$record->externalReference] ?? 0) + 1;
            }
        }

        $prepared = [];
        foreach ($mapped as $entry) {
            $record = $entry['record'];
            $mapping = $entry['mapping'];
            $rawFingerprint = $hasher->hash($record->payload);
            if (! $mapping->valid || $mapping->normalized === null) {
                $prepared[] = $this->rejectedItem($record, $mapping->reasonCode, $rawFingerprint);

                continue;
            }

            $normalizedFingerprint = $hasher->hash($mapping->normalized);
            if (($referenceCounts[$record->externalReference] ?? 0) > 1) {
                $prepared[] = $this->proposedItem(
                    $record,
                    'conflict',
                    $mapping->normalized,
                    $rawFingerprint,
                    $normalizedFingerprint,
                    null,
                    'duplicate_external_reference',
                    null,
                    null,
                    [],
                );

                continue;
            }

            $proposal = $reconciler->propose($record->entityType, $mapping->normalized);
            $this->assertProposal($proposal);
            $prepared[] = $this->proposedItem(
                $record,
                $proposal->result,
                $mapping->normalized,
                $rawFingerprint,
                $normalizedFingerprint,
                $proposal->proposedAction,
                $proposal->reasonCode,
                $proposal->candidateType,
                $proposal->candidateId,
                $proposal->candidateIds,
            );
        }

        return $prepared;
    }

    private function assertMappingResult(MappingResult $mapping): void
    {
        if (! preg_match('/^[a-z0-9_]{1,80}$/', $mapping->reasonCode)) {
            throw new ImportContractException('El mapeador devolvió un código de motivo inválido.');
        }
        if ($mapping->valid !== ($mapping->normalized !== null)) {
            throw new ImportContractException('El mapeador devolvió un resultado inconsistente.');
        }
    }

    private function assertProposal(ReconciliationProposal $proposal): void
    {
        $coherent = match ($proposal->result) {
            'new' => $proposal->proposedAction === 'create' && $proposal->candidateId === null,
            'change' => $proposal->proposedAction === 'update' && $proposal->candidateId !== null,
            'unchanged' => $proposal->proposedAction === 'none' && $proposal->candidateId !== null,
            'conflict' => $proposal->proposedAction === null
                || in_array($proposal->proposedAction, ['create', 'update', 'none'], true),
            default => false,
        };
        if (! $coherent
            || preg_match('/^[a-z0-9_]{1,80}$/', $proposal->reasonCode) !== 1
            || count($proposal->candidateIds) > 20) {
            throw new ImportContractException('La propuesta de conciliación no es coherente.');
        }
        foreach ($proposal->candidateIds as $candidateId) {
            if (! Str::isUuid($candidateId)) {
                throw new ImportContractException('La propuesta contiene un candidato inválido.');
            }
        }
        if (($proposal->candidateType === null) !== ($proposal->candidateId === null)) {
            throw new ImportContractException('La propuesta contiene una referencia parcial.');
        }
        if ($proposal->candidateId !== null
            && ($proposal->candidateType !== 'subject'
                || ! Str::isUuid($proposal->candidateId)
                || ! in_array($proposal->candidateId, $proposal->candidateIds, true))) {
            throw new ImportContractException('La propuesta contiene una referencia de candidato inconsistente.');
        }
    }

    /** @return PreparedItem */
    private function rejectedItem(InstitutionalRecord $record, string $reason, string $rawFingerprint): array
    {
        return [
            'row' => $record->rowNumber,
            'external_reference' => $record->externalReference,
            'entity_type' => $record->entityType,
            'raw' => $record->payload,
            'raw_fingerprint' => $rawFingerprint,
            'normalized' => null,
            'normalized_fingerprint' => null,
            'result' => 'rejected',
            'proposed_action' => null,
            'reason' => $reason,
            'candidate_type' => null,
            'candidate_id' => null,
            'candidate_ids' => [],
        ];
    }

    /**
     * @param  array<string, bool|float|int|string>  $normalized
     * @param  list<string>  $candidateIds
     * @return PreparedItem
     */
    private function proposedItem(
        InstitutionalRecord $record,
        string $result,
        array $normalized,
        string $rawFingerprint,
        string $normalizedFingerprint,
        ?string $proposedAction,
        string $reason,
        ?string $candidateType,
        ?string $candidateId,
        array $candidateIds,
    ): array {
        return [
            'row' => $record->rowNumber,
            'external_reference' => $record->externalReference,
            'entity_type' => $record->entityType,
            'raw' => $record->payload,
            'raw_fingerprint' => $rawFingerprint,
            'normalized' => $normalized,
            'normalized_fingerprint' => $normalizedFingerprint,
            'result' => $result,
            'proposed_action' => $proposedAction,
            'reason' => $reason,
            'candidate_type' => $candidateType,
            'candidate_id' => $candidateId,
            'candidate_ids' => $candidateIds,
        ];
    }

    /** @param list<PreparedItem> $prepared */
    private function persistCompleted(
        array $prepared,
        string $inputFingerprint,
        string $readerVersion,
        RecordAuditEvent $audit,
    ): void {
        DB::transaction(function () use ($audit, $inputFingerprint, $prepared, $readerVersion): void {
            $execution = ImportExecution::query()->lockForUpdate()->findOrFail($this->executionId);
            if (in_array($execution->estado, ['completed', 'failed'], true)) {
                return;
            }
            if ($execution->estado !== 'running' || $execution->items()->exists()) {
                throw new ImportContractException('La ejecución no admite staging parcial.');
            }

            $valid = 0;
            $rejected = 0;
            $conflicts = 0;
            $creates = 0;
            $updates = 0;
            $unchanged = 0;
            foreach ($prepared as $entry) {
                $item = ImportItem::query()->create([
                    'ejecucion_importacion_id' => $execution->id,
                    'numero_fila' => $entry['row'],
                    'referencia_externa' => $entry['external_reference'],
                    'tipo_entidad' => $entry['entity_type'],
                    'payload_original' => $entry['raw'],
                    'huella_original' => $entry['raw_fingerprint'],
                    'payload_normalizado' => $entry['normalized'],
                    'huella_normalizada' => $entry['normalized_fingerprint'],
                    'resultado' => $entry['result'],
                    'accion_propuesta' => $entry['proposed_action'],
                    'codigo_motivo' => $entry['reason'],
                    'tipo_candidato' => $entry['candidate_type'],
                    'candidato_id' => $entry['candidate_id'],
                ]);
                if ($entry['result'] === 'rejected') {
                    $rejected++;
                } else {
                    $valid++;
                }
                if ($entry['result'] === 'conflict') {
                    $conflicts++;
                    ImportConflict::query()->create([
                        'ejecucion_importacion_id' => $execution->id,
                        'item_importacion_id' => $item->id,
                        'tipo' => $entry['reason'],
                        'candidatos' => $entry['candidate_ids'],
                        'estado' => 'pending',
                    ]);
                }
                match ($entry['proposed_action']) {
                    'create' => $creates++,
                    'update' => $updates++,
                    'none' => $unchanged++,
                    default => null,
                };
            }

            $execution->update([
                'estado' => 'completed',
                'version_lector_ejecutada' => $readerVersion,
                'huella_entrada' => $inputFingerprint,
                'total_items' => count($prepared),
                'items_validos' => $valid,
                'items_rechazados' => $rejected,
                'conflictos' => $conflicts,
                'altas_propuestas' => $creates,
                'cambios_propuestos' => $updates,
                'sin_cambio_propuesto' => $unchanged,
                'completado_en' => now(),
            ]);
            $job = JobExecution::query()->lockForUpdate()->findOrFail($execution->ejecucion_trabajo_id);
            $job->update([
                'status' => 'completed',
                'progress' => 100,
                'result' => [
                    'status' => 'simulation_completed',
                    'total_items' => count($prepared),
                    'valid_items' => $valid,
                    'rejected_items' => $rejected,
                    'conflicts' => $conflicts,
                ],
                'finished_at' => now(),
                'error_code' => null,
                'error_message' => null,
            ]);
            $this->notify($execution, 'completed');
            $audit->execute(
                actorId: null,
                roleAssignmentId: null,
                action: 'institutional_import.simulation_completed',
                resourceType: 'import_execution',
                resourceId: $execution->id,
                result: 'success',
                metadata: [
                    'total_items' => count($prepared),
                    'valid_items' => $valid,
                    'rejected_items' => $rejected,
                    'conflicts' => $conflicts,
                    'input_fingerprint' => $inputFingerprint,
                    'mode' => 'simulation',
                ],
                correlationId: $job->correlation_id,
            );
        });
    }

    private function finishFailed(string $code, string $message, RecordAuditEvent $audit): void
    {
        DB::transaction(function () use ($audit, $code, $message): void {
            $execution = ImportExecution::query()->lockForUpdate()->find($this->executionId);
            if ($execution === null || in_array($execution->estado, ['completed', 'failed'], true)) {
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
                $this->notify($execution, 'failed');
                $audit->execute(
                    actorId: null,
                    roleAssignmentId: null,
                    action: 'institutional_import.simulation_failed',
                    resourceType: 'import_execution',
                    resourceId: $execution->id,
                    result: 'failed',
                    metadata: ['error_code' => $code, 'mode' => 'simulation'],
                    correlationId: $job->correlation_id,
                );
            }
        });
    }

    private function notify(ImportExecution $execution, string $status): void
    {
        InternalNotification::query()->firstOrCreate(
            [
                'usuario_id' => $execution->solicitado_por,
                'clave_deduplicacion' => "institutional_import.{$status}:{$execution->id}",
            ],
            [
                'tipo' => "institutional_import.{$status}",
                'titulo' => $status === 'completed'
                    ? 'Simulación institucional terminada'
                    : 'Simulación institucional no completada',
                'mensaje' => $status === 'completed'
                    ? 'El lote sintético fue clasificado para revisión. Ningún catálogo académico fue modificado.'
                    : 'La simulación terminó con un fallo seguro. Ningún catálogo académico fue modificado.',
                'tipo_recurso' => 'import_execution',
                'recurso_id' => $execution->id,
                'creado_en' => now(),
            ],
        );
    }
}
