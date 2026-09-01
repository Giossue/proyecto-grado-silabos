<?php

namespace App\Modules\AiAssistance\Application\Actions;

use App\Models\User;
use App\Modules\AiAssistance\Infrastructure\Persistence\Models\AiFeedback;
use App\Modules\AiAssistance\Infrastructure\Persistence\Models\AiRecommendation;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class RecordAiFeedback
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    public function execute(
        Syllabus $syllabus,
        AiRecommendation $recommendation,
        string $decision,
        User $actor,
        Request $request,
    ): AiFeedback {
        if (! in_array($decision, ['aceptada', 'ignorada', 'no_util'], true)) {
            throw ValidationException::withMessages(['decision' => 'Seleccione una decisión válida.']);
        }

        return DB::transaction(function () use ($actor, $decision, $recommendation, $request, $syllabus): AiFeedback {
            $lockedRecommendation = AiRecommendation::query()
                ->with('execution')
                ->whereKey($recommendation->id)
                ->lockForUpdate()
                ->firstOrFail();
            if ($lockedRecommendation->execution->silabo_id !== $syllabus->id
                || $lockedRecommendation->execution->estado !== 'completada') {
                throw ValidationException::withMessages([
                    'recommendation' => 'La recomendación ya no está disponible para esta decisión.',
                ]);
            }
            $activeRole = $this->roles->resolve($request);
            $feedback = AiFeedback::query()->firstOrCreate([
                'recomendacion_ia_id' => $lockedRecommendation->id,
                'usuario_id' => $actor->id,
                'decision' => $decision,
            ], [
                'asignacion_rol_id' => $activeRole?->id,
                'decidido_en' => now(),
            ]);
            if ($feedback->wasRecentlyCreated) {
                $this->audit->execute(
                    actorId: $actor->id,
                    roleAssignmentId: $activeRole?->id,
                    action: "ia.recomendacion_{$decision}",
                    resourceType: 'recomendacion_ia',
                    resourceId: $lockedRecommendation->id,
                    result: 'exito',
                    metadata: ['ai_execution_id' => $lockedRecommendation->ejecucion_ia_id],
                    correlationId: $request->attributes->getString('correlation_id') ?: null,
                );
            }

            return $feedback;
        });
    }
}
