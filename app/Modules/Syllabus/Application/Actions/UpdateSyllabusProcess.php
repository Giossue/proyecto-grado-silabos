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
 * Las fechas se cambian solo en preparación o en pausa. El nombre se deriva del período.
 */
class UpdateSyllabusProcess
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    /** @param array{period_id: string, starts_at: string, due_at: string} $data */
    public function execute(SyllabusProcess $process, array $data, User $actor, Request $request): SyllabusProcess
    {
        $activeRole = $this->roles->resolve($request);
        if ($activeRole?->role->codigo !== RoleCode::Administrator->value) {
            abort(403);
        }

        return DB::transaction(function () use ($actor, $activeRole, $data, $process, $request): SyllabusProcess {
            $locked = SyllabusProcess::query()->lockForUpdate()->findOrFail($process->id);
            if (! $locked->isConfigurable()) {
                throw ValidationException::withMessages([
                    'process' => 'Solo un proceso en preparación o en pausa admite cambios. Pause el proceso para modificar las fechas.',
                ]);
            }

            $before = [
                'before_period_id' => $locked->periodo_academico_id,
                'before_starts_at' => $locked->inicia_en->toIso8601String(),
                'before_due_at' => $locked->entrega_en->toIso8601String(),
            ];
            if ($locked->periodo_academico_id !== $data['period_id'] && $locked->convocations()->exists()) {
                throw ValidationException::withMessages([
                    'period_id' => 'No se puede cambiar el período de un proceso que ya tiene convocatorias.',
                ]);
            }
            $locked->update([
                'periodo_academico_id' => $data['period_id'],
                'inicia_en' => $data['starts_at'],
                'entrega_en' => $data['due_at'],
            ]);

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole->id,
                action: 'proceso_silabos.actualizado',
                resourceType: 'proceso_silabos',
                resourceId: $locked->id,
                result: 'exito',
                metadata: [
                    ...$before,
                    'after_period_id' => $locked->periodo_academico_id,
                    'after_starts_at' => $locked->inicia_en->toIso8601String(),
                    'after_due_at' => $locked->entrega_en->toIso8601String(),
                ],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $locked;
        });
    }
}
