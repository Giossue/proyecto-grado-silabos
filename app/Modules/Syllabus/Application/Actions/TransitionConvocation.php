<?php

namespace App\Modules\Syllabus\Application\Actions;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusProcess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Pausa y reanudación por carrera. El cierre no es de la carrera: lo decide
 * Administración cerrando el proceso, que detiene a todas las convocatorias. La pausa es lo que permite a Coordinación corregir
 * su malla o sus fuentes sin que los docentes sigan trabajando sobre lo que cambia; no
 * toca a las demás carreras. Reanudar exige que el proceso institucional siga abierto.
 */
class TransitionConvocation
{
    public const PAUSE = 'pausar';

    public const RESUME = 'reanudar';

    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    public function execute(
        Convocation $convocation,
        string $transition,
        ?string $reason,
        User $actor,
        Request $request,
    ): Convocation {
        $activeRole = $this->roles->resolve($request);
        if ($activeRole?->role->codigo !== RoleCode::Coordinator->value
            || $activeRole->carrera_id !== $convocation->carrera_id) {
            abort(403);
        }

        return DB::transaction(function () use ($activeRole, $actor, $convocation, $reason, $request, $transition): Convocation {
            $locked = Convocation::query()->lockForUpdate()->with('process')->findOrFail($convocation->id);

            [$from, $to] = match ($transition) {
                self::PAUSE => [[Convocation::STATE_OPEN], Convocation::STATE_PAUSED],
                self::RESUME => [[Convocation::STATE_PAUSED], Convocation::STATE_OPEN],
                default => throw ValidationException::withMessages(['transition' => 'La acción sobre la convocatoria no existe.']),
            };
            if (! in_array($locked->estado, $from, true)) {
                throw ValidationException::withMessages([
                    'convocation' => $transition === self::PAUSE
                        ? 'Solo una convocatoria abierta puede pausarse.'
                        : 'Solo una convocatoria pausada puede reanudarse.',
                ]);
            }
            if ($to === Convocation::STATE_OPEN && $locked->process->estado !== SyllabusProcess::STATE_OPEN) {
                throw ValidationException::withMessages([
                    'convocation' => 'El proceso institucional no está abierto; la convocatoria se reanudará cuando Administración lo reanude.',
                ]);
            }

            $locked->update(['estado' => $to]);

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole->id,
                action: "convocatoria.{$to}",
                resourceType: 'convocatoria',
                resourceId: $locked->id,
                result: 'exito',
                metadata: array_filter(['reason' => $reason], fn (mixed $value): bool => $value !== null),
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $locked;
        });
    }
}
