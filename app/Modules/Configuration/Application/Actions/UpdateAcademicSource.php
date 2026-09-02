<?php

namespace App\Modules\Configuration\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\AcademicSource;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\ProcessLocks;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class UpdateAcademicSource
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly ProcessLocks $locks,
    ) {}

    /** @param array<string, mixed> $data */
    public function execute(AcademicSource $source, array $data, User $actor, Request $request): AcademicSource
    {
        $activeRole = $this->roles->resolve($request);
        // Con una convocatoria en curso los sílabos se apoyan en las fuentes: se pausa antes.
        $this->locks->assertCareerEditable($source->carrera_id);

        return DB::transaction(function () use ($actor, $activeRole, $data, $request, $source): AcademicSource {
            $locked = AcademicSource::query()->whereKey($source->id)->lockForUpdate()->firstOrFail();
            $locked->update([
                'nombre' => $data['nombre'],
                'descripcion' => $data['description'] ?? null,
                'notas_internas' => $data['internal_notes'] ?? null,
            ]);

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'fuente.actualizada',
                resourceType: 'fuente_academica',
                resourceId: $locked->id,
                result: 'exito',
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $locked;
        });
    }
}
