<?php

namespace App\Modules\Syllabus\Application\Actions;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\ConvocationSchedule;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\ConvocationDeadline;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusProcess;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * La prórroga es de Administración porque el calendario es de la universidad, no de
 * cada carrera. Se mueve la fecha del proceso y, con ella, la misma etapa de todas sus
 * convocatorias; es una excepción, así que exige motivo y conserva la fecha anterior en
 * auditoría. Solo hacia adelante: adelantar dejaría fuera de plazo a quien ya estaba
 * dentro.
 */
class ExtendProcessDeadline
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    public function execute(
        SyllabusProcess $process,
        string $stage,
        string $newDueAt,
        string $reason,
        User $actor,
        Request $request,
    ): SyllabusProcess {
        $activeRole = $this->roles->resolve($request);
        if ($activeRole?->role->codigo !== RoleCode::Administrator->value) {
            abort(403);
        }
        if ($process->estado === SyllabusProcess::STATE_CLOSED) {
            throw ValidationException::withMessages(['process' => 'Un proceso cerrado ya no admite prórrogas.']);
        }
        if (! in_array($stage, [ConvocationSchedule::STAGE_START, ConvocationSchedule::STAGE_DRAFT], true)) {
            throw ValidationException::withMessages(['stage' => 'El proceso no tiene esa etapa.']);
        }

        $column = $stage === ConvocationSchedule::STAGE_START ? 'inicia_en' : 'entrega_en';
        $requested = CarbonImmutable::parse($newDueAt);
        $previous = $process->{$column};

        if ($requested->lessThanOrEqualTo($previous)) {
            throw ValidationException::withMessages([
                'due_at' => 'La nueva fecha debe ser posterior a la vigente, que es el '
                    .$previous->translatedFormat('d/m/Y H:i').'.',
            ]);
        }
        if ($requested->isPast()) {
            throw ValidationException::withMessages(['due_at' => 'La nueva fecha ya pasó.']);
        }
        if ($stage === ConvocationSchedule::STAGE_START && $requested->greaterThanOrEqualTo($process->entrega_en)) {
            throw ValidationException::withMessages(['due_at' => 'El inicio no puede quedar después de la fecha de entrega.']);
        }

        return DB::transaction(function () use ($activeRole, $actor, $column, $previous, $process, $reason, $request, $requested, $stage): SyllabusProcess {
            $locked = SyllabusProcess::query()->lockForUpdate()->findOrFail($process->id);
            $locked->update([$column => $requested]);

            // Las convocatorias copiaron la fecha al prepararse; la prórroga las alcanza a
            // todas, pero nunca les quita tiempo si alguna ya tenía una fecha mayor.
            $reached = ConvocationDeadline::query()
                ->where('etapa', $stage)
                ->where('vence_en', '<', $requested)
                ->whereIn('convocatoria_id', Convocation::query()->where('proceso_id', $locked->id)->select('id'))
                ->update(['vence_en' => $requested]);

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole->id,
                action: 'proceso_silabos.plazo_extendido',
                resourceType: 'proceso_silabos',
                resourceId: $locked->id,
                result: 'exito',
                metadata: [
                    'stage' => $stage,
                    'previous_due_at' => $previous->toIso8601String(),
                    'new_due_at' => $requested->toIso8601String(),
                    'reason' => $reason,
                    'convocations_reached' => $reached,
                ],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $locked->refresh();
        });
    }
}
