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
 * Pausa, reanudación y cierre por carrera. La pausa es lo que permite a Coordinación corregir
 * su malla o sus fuentes sin que los docentes sigan trabajando sobre lo que cambia; no
 * toca a las demás carreras. Reanudar exige que el proceso institucional siga abierto.
 * Cerrar es definitivo: los expedientes se conservan y ya no admiten envíos.
 */
class TransitionConvocation
{
    public const PAUSE = 'pausar';

    public const RESUME = 'reanudar';

    public const CLOSE = 'cerrar';

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
                self::CLOSE => [[Convocation::STATE_OPEN, Convocation::STATE_PAUSED], Convocation::STATE_CLOSED],
                default => throw ValidationException::withMessages(['transition' => 'La acción sobre la convocatoria no existe.']),
            };
            if (! in_array($locked->estado, $from, true)) {
                throw ValidationException::withMessages([
                    'convocation' => match ($transition) {
                        self::PAUSE => 'Solo una convocatoria abierta puede pausarse.',
                        self::RESUME => 'Solo una convocatoria pausada puede reanudarse.',
                        default => 'Solo una convocatoria abierta o pausada puede cerrarse.',
                    },
                ]);
            }
            if ($to === Convocation::STATE_OPEN && $locked->process->estado !== SyllabusProcess::STATE_OPEN) {
                throw ValidationException::withMessages([
                    'convocation' => 'El proceso institucional no está abierto; la convocatoria se reanudará cuando Administración lo reanude.',
                ]);
            }

            $locked->update($to === Convocation::STATE_CLOSED
                ? ['estado' => $to, 'cerrado_en' => now()]
                : ['estado' => $to]);

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
