<?php

namespace App\Modules\Configuration\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\AcademicSource;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class UpdateAcademicSource
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    /** @param array<string, mixed> $data */
    public function execute(AcademicSource $source, array $data, User $actor, Request $request): AcademicSource
    {
        $activeRole = $this->roles->resolve($request);

        return DB::transaction(function () use ($actor, $activeRole, $data, $request, $source): AcademicSource {
            $locked = AcademicSource::query()->whereKey($source->id)->lockForUpdate()->firstOrFail();
            $locked->update([
                'nombre' => $data['name'],
                'descripcion' => $data['description'] ?? null,
                'notas_internas' => $data['internal_notes'] ?? null,
            ]);

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'source.updated',
                resourceType: 'academic_source',
                resourceId: $locked->id,
                result: 'success',
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $locked;
        });
    }
}
