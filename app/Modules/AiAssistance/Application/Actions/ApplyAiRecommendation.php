<?php

namespace App\Modules\AiAssistance\Application\Actions;

use App\Models\User;
use App\Modules\AiAssistance\Infrastructure\Persistence\Models\AiFeedback;
use App\Modules\AiAssistance\Infrastructure\Persistence\Models\AiRecommendation;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\Actions\UpdateDraftField;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\FieldValue;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Support\CanonicalHasher;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ApplyAiRecommendation
{
    public function __construct(
        private readonly UpdateDraftField $updateDraftField,
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly CanonicalHasher $hasher,
    ) {}

    public function execute(
        Syllabus $syllabus,
        AiRecommendation $recommendation,
        int $expectedLockVersion,
        User $actor,
        Request $request,
    ): Syllabus {
        return DB::transaction(function () use ($actor, $expectedLockVersion, $recommendation, $request, $syllabus): Syllabus {
            $locked = Syllabus::query()->lockForUpdate()->findOrFail($syllabus->id);
            $lockedRecommendation = AiRecommendation::query()
                ->with(['execution', 'execution.field'])
                ->whereKey($recommendation->id)
                ->lockForUpdate()
                ->firstOrFail();
            if ($lockedRecommendation->execution->silabo_id !== $locked->id
                || $lockedRecommendation->execution->estado !== 'completada'
                || $lockedRecommendation->definicion_campo_id !== $lockedRecommendation->execution->definicion_campo_id) {
                throw ValidationException::withMessages([
                    'recommendation' => 'La recomendación no corresponde a este campo y sílabo.',
                ]);
            }
            $applied = AiFeedback::query()
                ->where('recomendacion_ia_id', $lockedRecommendation->id)
                ->where('decision', 'aplicada')
                ->first();
            if ($applied !== null) {
                return $locked;
            }
            if (! in_array($locked->estado, ['borrador', 'correccion_solicitada'], true)) {
                throw ValidationException::withMessages(['syllabus' => 'El sílabo ya no está en estado editable.']);
            }
            if ($locked->version_bloqueo !== $expectedLockVersion) {
                throw ValidationException::withMessages([
                    'version_bloqueo' => 'El borrador cambió. Recarga y compara nuevamente antes de aplicar.',
                ]);
            }

            $fieldValue = FieldValue::query()
                ->where('silabo_id', $locked->id)
                ->where('definicion_campo_id', $lockedRecommendation->definicion_campo_id)
                ->first();
            $currentValue = $fieldValue === null ? '' : $fieldValue->valor;
            if (! is_string($currentValue)
                || ! hash_equals($lockedRecommendation->execution->huella_contenido, $this->hasher->hash($currentValue))) {
                throw ValidationException::withMessages([
                    'recommendation' => 'El contenido analizado cambió. Solicita una recomendación nueva.',
                ]);
            }
            $suggestedText = $lockedRecommendation->texto_sugerido;
            $maxLength = $lockedRecommendation->execution->field->tipo === 'texto_corto' ? 1000 : 50000;
            if (mb_strlen($suggestedText) > $maxLength
                || preg_match('/<\/?[a-z][^>]*>/i', $suggestedText) === 1) {
                throw ValidationException::withMessages([
                    'recommendation' => 'El texto sugerido no cumple las reglas del campo.',
                ]);
            }

            $updated = $this->updateDraftField->execute(
                $locked,
                $lockedRecommendation->execution->field,
                ['version_bloqueo' => $expectedLockVersion, 'value' => $suggestedText],
                $actor,
                $request,
            );
            $activeRole = $this->roles->resolve($request);
            AiFeedback::query()->create([
                'recomendacion_ia_id' => $lockedRecommendation->id,
                'usuario_id' => $actor->id,
                'asignacion_rol_id' => $activeRole?->id,
                'decision' => 'aplicada',
                'contenido_antes' => $currentValue,
                'contenido_despues' => $suggestedText,
                'version_bloqueo_origen' => $expectedLockVersion,
                'version_bloqueo_resultado' => $updated->version_bloqueo,
                'decidido_en' => now(),
            ]);
            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'ia.recomendacion_aplicada',
                resourceType: 'recomendacion_ia',
                resourceId: $lockedRecommendation->id,
                result: 'exito',
                metadata: [
                    'ai_execution_id' => $lockedRecommendation->ejecucion_ia_id,
                    'field_key' => $lockedRecommendation->execution->field->clave,
                    'before_fingerprint' => $this->hasher->hash($currentValue),
                    'after_fingerprint' => $this->hasher->hash($suggestedText),
                    'lock_version_origin' => $expectedLockVersion,
                    'lock_version_result' => $updated->version_bloqueo,
                ],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $updated;
        });
    }
}
