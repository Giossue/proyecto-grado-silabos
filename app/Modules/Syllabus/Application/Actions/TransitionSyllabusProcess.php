<?php

namespace App\Modules\Syllabus\Application\Actions;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusProcess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Ciclo del proceso institucional: preparación → abierto ⇄ pausado → cerrado.
 *
 * Abrir exige que no haya otro proceso en curso y que la plantilla siga publicada.
 * Pausar detiene a toda la universidad —envíos y ediciones docentes— y es lo que
 * habilita cambiar la plantilla; por eso pide motivo. Reanudar vuelve a comprobar la
 * plantilla: pudo cambiarse durante la pausa. Cerrar es definitivo.
 */
class TransitionSyllabusProcess
{
    public const OPEN = 'abrir';

    public const PAUSE = 'pausar';

    public const RESUME = 'reanudar';

    public const CLOSE = 'cerrar';

    /** @var array<string, array{from: list<string>, to: string}> */
    private const TRANSITIONS = [
        self::OPEN => ['from' => [SyllabusProcess::STATE_PREPARATION], 'to' => SyllabusProcess::STATE_OPEN],
        self::PAUSE => ['from' => [SyllabusProcess::STATE_OPEN], 'to' => SyllabusProcess::STATE_PAUSED],
        self::RESUME => ['from' => [SyllabusProcess::STATE_PAUSED], 'to' => SyllabusProcess::STATE_OPEN],
        self::CLOSE => ['from' => [SyllabusProcess::STATE_OPEN, SyllabusProcess::STATE_PAUSED], 'to' => SyllabusProcess::STATE_CLOSED],
    ];

    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    public function execute(
        SyllabusProcess $process,
        string $transition,
        ?string $reason,
        User $actor,
        Request $request,
    ): SyllabusProcess {
        $activeRole = $this->roles->resolve($request);
        if ($activeRole?->role->codigo !== RoleCode::Administrator->value) {
            abort(403);
        }
        $rule = self::TRANSITIONS[$transition] ?? null;
        if ($rule === null) {
            throw ValidationException::withMessages(['transition' => 'La acción sobre el proceso no existe.']);
        }

        return DB::transaction(function () use ($activeRole, $actor, $process, $reason, $request, $rule, $transition): SyllabusProcess {
            $locked = SyllabusProcess::query()->lockForUpdate()->with('templateVersion')->findOrFail($process->id);
            if (! in_array($locked->estado, $rule['from'], true)) {
                throw ValidationException::withMessages([
                    'process' => 'El proceso no está en un estado que admita esta acción.',
                ]);
            }

            if ($rule['to'] === SyllabusProcess::STATE_OPEN) {
                if ($locked->templateVersion->estado !== 'publicada') {
                    throw ValidationException::withMessages([
                        'process' => 'La plantilla fijada ya no está publicada. Elija una versión publicada antes de abrir.',
                    ]);
                }
                $other = SyllabusProcess::query()->inProgress()->whereKeyNot($locked->id)->first(['nombre']);
                if ($other !== null) {
                    throw ValidationException::withMessages([
                        'process' => "Ya existe un proceso en curso: «{$other->nombre}». Ciérrelo antes de abrir otro.",
                    ]);
                }
            }

            $previous = $locked->estado;
            $locked->update([
                'estado' => $rule['to'],
                ...match ($transition) {
                    self::OPEN => ['abierto_por' => $actor->id, 'abierto_en' => now(), 'pausado_en' => null],
                    self::PAUSE => ['pausado_en' => now()],
                    self::RESUME => ['pausado_en' => null],
                    self::CLOSE => ['cerrado_en' => now()],
                    default => [],
                },
            ]);

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole->id,
                action: "proceso_silabos.{$rule['to']}",
                resourceType: 'proceso_silabos',
                resourceId: $locked->id,
                result: 'exito',
                metadata: array_filter([
                    'previous_state' => $previous,
                    'reason' => $reason,
                ], fn (mixed $value): bool => $value !== null),
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $locked;
        });
    }
}
