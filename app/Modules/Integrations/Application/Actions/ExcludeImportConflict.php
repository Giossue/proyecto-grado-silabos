<?php

namespace App\Modules\Integrations\Application\Actions;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Integrations\Infrastructure\Persistence\Models\ImportConflict;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ExcludeImportConflict
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    public function execute(
        ImportConflict $conflict,
        string $justification,
        User $actor,
        Request $request,
    ): ImportConflict {
        return DB::transaction(function () use ($actor, $conflict, $justification, $request): ImportConflict {
            $locked = ImportConflict::query()
                ->with('execution')
                ->lockForUpdate()
                ->findOrFail($conflict->id);
            if ($locked->estado === 'resolved') {
                if ($locked->decision === 'exclude'
                    && $locked->justificacion === $justification
                    && $locked->resuelto_por === $actor->id) {
                    return $locked;
                }

                throw ValidationException::withMessages([
                    'conflict' => 'Este conflicto ya tiene una decisión inmutable.',
                ]);
            }
            if ($locked->execution->estado !== 'completed') {
                throw ValidationException::withMessages([
                    'conflict' => 'Espere a que la simulación termine antes de registrar una decisión.',
                ]);
            }

            $locked->update([
                'estado' => 'resolved',
                'decision' => 'exclude',
                'justificacion' => $justification,
                'resuelto_por' => $actor->id,
                'resuelto_en' => now(),
            ]);
            $activeRole = $this->roles->resolve($request);
            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'institutional_import.conflict_excluded',
                resourceType: 'import_conflict',
                resourceId: $locked->id,
                result: 'success',
                metadata: [
                    'conflict_type' => $locked->tipo,
                    'decision' => 'exclude',
                    'justification_length' => mb_strlen($justification),
                ],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $locked->refresh();
        });
    }
}
