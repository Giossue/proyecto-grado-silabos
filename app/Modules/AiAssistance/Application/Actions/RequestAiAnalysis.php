<?php

namespace App\Modules\AiAssistance\Application\Actions;

use App\Models\User;
use App\Modules\AiAssistance\Application\AiEvidenceCollector;
use App\Modules\AiAssistance\Domain\Contracts\AiAnalysisGateway;
use App\Modules\AiAssistance\Infrastructure\Jobs\AnalyzeSyllabusFieldJob;
use App\Modules\AiAssistance\Infrastructure\Persistence\Models\AiEvidence;
use App\Modules\AiAssistance\Infrastructure\Persistence\Models\AiExecution;
use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Operations\Infrastructure\Persistence\Models\JobExecution;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\FieldValue;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Support\CanonicalHasher;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class RequestAiAnalysis
{
    public function __construct(
        private readonly AiAnalysisGateway $gateway,
        private readonly AiEvidenceCollector $evidenceCollector,
        private readonly CanonicalHasher $hasher,
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    public function execute(
        Syllabus $syllabus,
        FieldDefinition $field,
        string $idempotencyKey,
        User $actor,
        Request $request,
    ): AiExecution {
        $existing = $this->existingIdempotent($syllabus->id, $field->id, $idempotencyKey, $actor);
        if ($existing !== null) {
            return $existing;
        }

        return DB::transaction(function () use ($actor, $field, $idempotencyKey, $request, $syllabus): AiExecution {
            $locked = Syllabus::query()->with('convocation')->lockForUpdate()->findOrFail($syllabus->id);
            $existing = $this->existingIdempotent($locked->id, $field->id, $idempotencyKey, $actor);
            if ($existing !== null) {
                return $existing;
            }
            $this->assertEligible($locked, $field);

            $fieldValue = FieldValue::query()
                ->where('silabo_id', $locked->id)
                ->where('definicion_campo_id', $field->id)
                ->first();
            $content = $fieldValue === null ? '' : $fieldValue->valor;
            if (! is_string($content) || mb_strlen($content) > (int) config('ai.limits.input_characters')) {
                throw ValidationException::withMessages([
                    'field' => 'La asistencia solo admite texto de hasta 50 000 caracteres.',
                ]);
            }

            $evidenceSet = $this->evidenceCollector->collect($locked);
            $contentFingerprint = $this->hasher->hash($content);
            $functionalKey = $this->hasher->hash([
                'content_fingerprint' => $contentFingerprint,
                'field_id' => $field->id,
                'field_rules' => $field->reglas,
                'template_version_id' => $locked->version_plantilla_id,
                'source_set_fingerprint' => $evidenceSet['fingerprint'],
                'gateway_version' => $this->gateway->version(),
                'instruction_version' => (string) config('ai.instruction_version'),
                'contract_version' => (string) config('ai.contract_version'),
                'locale' => 'es-EC',
            ]);
            $reusable = AiExecution::query()
                ->where('silabo_id', $locked->id)
                ->where('definicion_campo_id', $field->id)
                ->where('clave_funcional', $functionalKey)
                ->whereIn('estado', ['pending', 'running', 'completed', 'inconclusive'])
                ->first();
            if ($reusable !== null) {
                $this->recordReuse($reusable, $actor, $request);

                return $reusable;
            }

            $evidenceRows = [];
            $evidenceMetadata = [];
            foreach ($evidenceSet['items'] as $item) {
                $evidenceId = (string) Str::uuid();
                $evidenceRows[] = $item + ['id' => $evidenceId];
                $evidenceMetadata[] = [
                    'evidence_id' => $evidenceId,
                    'source_version_id' => $item['source_version_id'],
                    'fragment_id' => $item['fragment_id'],
                    'fingerprint' => $item['fingerprint'],
                ];
            }

            $activeRole = $this->roles->resolve($request);
            $execution = AiExecution::query()->create([
                'silabo_id' => $locked->id,
                'definicion_campo_id' => $field->id,
                'version_plantilla_id' => $locked->version_plantilla_id,
                'clave_idempotencia' => $idempotencyKey,
                'clave_funcional' => $functionalKey,
                'estado' => 'pending',
                'version_contrato' => (string) config('ai.contract_version'),
                'version_instruccion' => (string) config('ai.instruction_version'),
                'version_gateway_solicitada' => $this->gateway->version(),
                'locale' => 'es-EC',
                'contenido_entrada' => $content,
                'huella_contenido' => $contentFingerprint,
                'huella_conjunto_fuentes' => $evidenceSet['fingerprint'],
                'metadatos_entrada' => [
                    'field_key' => $field->clave,
                    'evidence' => $evidenceMetadata,
                    'evidence_count' => count($evidenceRows),
                    'conflict_keys' => $evidenceSet['conflict_keys'],
                    'too_many_evidence' => $evidenceSet['too_many'],
                    'parameters' => [
                        'max_recommendations' => (int) config('ai.limits.recommendations'),
                        'max_evidence_items' => (int) config('ai.limits.evidence_items'),
                        'max_evidence_excerpt_characters' => (int) config('ai.limits.evidence_excerpt_characters'),
                    ],
                ],
                'lock_version_origen' => $locked->lock_version,
                'solicitado_por' => $actor->id,
                'asignacion_rol_id' => $activeRole?->id,
                'solicitado_en' => now(),
            ]);
            foreach ($evidenceRows as $item) {
                AiEvidence::query()->create([
                    'id' => $item['id'],
                    'ejecucion_ia_id' => $execution->id,
                    'fuente_academica_id' => $item['source_id'],
                    'version_fuente_id' => $item['source_version_id'],
                    'fragmento_fuente_id' => $item['fragment_id'],
                    'nombre_fuente' => $item['source_name'],
                    'autoridad_fuente' => $item['source_authority'],
                    'numero_version' => $item['source_version'],
                    'clave_fragmento' => $item['fragment_key'],
                    'titulo_fragmento' => $item['fragment_title'],
                    'clave_dato' => $item['data_key'],
                    'extracto' => $item['excerpt'],
                    'huella_fragmento' => $item['fingerprint'],
                ]);
            }

            $correlationId = $request->attributes->getString('correlation_id');
            $jobExecution = JobExecution::query()->create([
                'type' => 'ai.analysis',
                'queue_name' => 'ai',
                'status' => 'pending',
                'idempotency_key' => "ai.analysis:{$locked->id}:{$field->id}:{$idempotencyKey}",
                'correlation_id' => Str::isUuid($correlationId) ? $correlationId : (string) Str::uuid(),
                'resource_type' => 'ai_execution',
                'resource_id' => $execution->id,
                'attempts' => 0,
                'max_attempts' => 3,
                'progress' => 0,
            ]);
            $execution->update(['ejecucion_trabajo_id' => $jobExecution->id]);
            AnalyzeSyllabusFieldJob::dispatch($execution->id)->afterCommit();
            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'ai.analysis_requested',
                resourceType: 'ai_execution',
                resourceId: $execution->id,
                result: 'success',
                metadata: [
                    'field_key' => $field->clave,
                    'content_fingerprint' => $contentFingerprint,
                    'source_set_fingerprint' => $evidenceSet['fingerprint'],
                    'evidence_count' => count($evidenceRows),
                    'gateway_version' => $this->gateway->version(),
                ],
                correlationId: $jobExecution->correlation_id,
            );

            return $execution->refresh();
        });
    }

    private function assertEligible(Syllabus $syllabus, FieldDefinition $field): void
    {
        if (! in_array($syllabus->estado, ['draft', 'correction_requested'], true)) {
            throw ValidationException::withMessages(['syllabus' => 'El sílabo no está en estado editable.']);
        }
        if ($field->version_plantilla_id !== $syllabus->version_plantilla_id
            || ! $field->ia_habilitada
            || ! $field->editable_docente
            || $field->heredado
            || ! in_array($field->tipo, ['short_text', 'long_text', 'markdown'], true)) {
            throw ValidationException::withMessages([
                'field' => 'La asistencia de IA no está habilitada para este campo.',
            ]);
        }
    }

    private function existingIdempotent(
        string $syllabusId,
        string $fieldId,
        string $key,
        User $actor,
    ): ?AiExecution {
        $execution = AiExecution::query()
            ->where('silabo_id', $syllabusId)
            ->where('definicion_campo_id', $fieldId)
            ->where('clave_idempotencia', $key)
            ->first();
        if ($execution !== null && $execution->solicitado_por !== $actor->id) {
            abort(403);
        }

        return $execution;
    }

    private function recordReuse(AiExecution $execution, User $actor, Request $request): void
    {
        $activeRole = $this->roles->resolve($request);
        $this->audit->execute(
            actorId: $actor->id,
            roleAssignmentId: $activeRole?->id,
            action: 'ai.analysis_reused',
            resourceType: 'ai_execution',
            resourceId: $execution->id,
            result: 'success',
            metadata: ['field_key' => $execution->metadatos_entrada['field_key'] ?? null],
            correlationId: $request->attributes->getString('correlation_id') ?: null,
        );
    }
}
