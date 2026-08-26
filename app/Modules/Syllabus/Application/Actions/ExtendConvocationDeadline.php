<?php

namespace App\Modules\Syllabus\Application\Actions;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\ConvocationSchedule;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\ConvocationDeadline;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * La prórroga existe para el caso que la coordinación describió: un docente se ausenta,
 * el plazo ya venció y hay que poder relevarlo y darle tiempo al que entra. Es una
 * excepción, así que exige motivo escrito.
 *
 * La fecha anterior no se pierde. `vence_en` se actualiza, pero el evento de auditoría
 * conserva el valor previo: sin eso no hay forma de demostrar que hubo prórroga ni cuándo.
 */
class ExtendConvocationDeadline
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly ConvocationSchedule $schedule,
        private readonly RecordAuditEvent $audit,
    ) {}

    public function execute(
        Convocation $convocation,
        string $stage,
        string $newDueAt,
        string $reason,
        User $actor,
        Request $request,
    ): ConvocationDeadline {
        $activeRole = $this->roles->resolve($request);
        if ($activeRole?->role->codigo !== RoleCode::Coordinator->value
            || $activeRole->carrera_id !== $convocation->carrera_id) {
            abort(403);
        }
        if ($convocation->estado === 'closed') {
            throw ValidationException::withMessages([
                'convocation' => 'Una convocatoria cerrada ya no admite prórrogas.',
            ]);
        }

        $deadline = $this->schedule->stage($convocation, $stage);
        if ($deadline === null) {
            throw ValidationException::withMessages([
                'stage' => 'La convocatoria no tiene esa etapa.',
            ]);
        }

        $requested = CarbonImmutable::parse($newDueAt);
        $previous = $deadline->vence_en;

        // Es una prórroga, no una edición libre: adelantar la fecha dejaría fuera de plazo
        // a quien ya estaba dentro.
        if ($requested->lessThanOrEqualTo($previous)) {
            throw ValidationException::withMessages([
                'due_at' => 'La nueva fecha debe ser posterior a la vigente, que es el '
                    .$previous->translatedFormat('d/m/Y H:i').'.',
            ]);
        }
        if ($requested->isPast()) {
            throw ValidationException::withMessages(['due_at' => 'La nueva fecha ya pasó.']);
        }
        if ($stage === ConvocationSchedule::STAGE_START) {
            $draft = $this->schedule->draftDeadline($convocation);
            if ($draft !== null && $requested->greaterThanOrEqualTo($draft)) {
                throw ValidationException::withMessages([
                    'due_at' => 'El inicio no puede quedar después de la fecha de entrega.',
                ]);
            }
        }

        return DB::transaction(function () use (
            $activeRole, $actor, $deadline, $previous, $reason, $request, $requested, $stage,
        ): ConvocationDeadline {
            $deadline->update(['vence_en' => $requested]);

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole->id,
                action: 'convocation.deadline_extended',
                resourceType: 'convocation',
                resourceId: $deadline->convocatoria_id,
                result: 'success',
                metadata: [
                    'stage' => $stage,
                    'previous_due_at' => $previous->toIso8601String(),
                    'new_due_at' => $requested->toIso8601String(),
                    'reason' => $reason,
                ],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $deadline->refresh();
        });
    }
}
