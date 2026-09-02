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
 * Nombre y fechas se cambian solo en preparación o en pausa. Con el proceso abierto,
 * los docentes ya están trabajando contra esas fechas.
 */
class UpdateSyllabusProcess
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    /** @param array{nombre: string, starts_at: string, due_at: string} $data */
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
                    'process' => 'Solo un proceso en preparación o en pausa admite cambios. Pause el proceso para modificar el nombre o las fechas.',
                ]);
            }

            $before = [
                'before_nombre' => $locked->nombre,
                'before_starts_at' => $locked->inicia_en->toIso8601String(),
                'before_due_at' => $locked->entrega_en->toIso8601String(),
            ];
            $locked->update([
                'nombre' => $data['nombre'],
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
                    'after_nombre' => $locked->nombre,
                    'after_starts_at' => $locked->inicia_en->toIso8601String(),
                    'after_due_at' => $locked->entrega_en->toIso8601String(),
                ],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $locked;
        });
    }
}
