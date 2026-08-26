<?php

namespace App\Modules\Configuration\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SourceConflict;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ResolveSourceConflict
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    public function execute(
        SourceConflict $conflict,
        string $decision,
        string $justification,
        User $actor,
        Request $request,
    ): SourceConflict {
        if (! in_array($decision, ['candidate', 'active'], true)) {
            throw ValidationException::withMessages(['decision' => 'Seleccione qué valor conserva autoridad.']);
        }

        $activeRole = $this->roles->resolve($request);

        return DB::transaction(function () use ($actor, $conflict, $activeRole, $decision, $justification, $request): SourceConflict {
            $locked = SourceConflict::query()->whereKey($conflict->id)->lockForUpdate()->firstOrFail();

            if ($locked->estado === 'resolved') {
                throw ValidationException::withMessages(['conflict' => 'El conflicto ya fue resuelto.']);
            }

            $locked->update([
                'estado' => 'resolved',
                'decision' => $decision,
                'justificacion' => $justification,
                'resuelto_por' => $actor->id,
                'resuelto_en' => now(),
            ]);

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'source.conflict_resolved',
                resourceType: 'source_conflict',
                resourceId: $locked->id,
                result: 'success',
                metadata: ['decision' => $decision],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $locked;
        });
    }
}
