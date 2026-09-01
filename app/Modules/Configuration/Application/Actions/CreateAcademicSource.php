<?php

namespace App\Modules\Configuration\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\AcademicSource;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CreateAcademicSource
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    /** @param array<string, mixed> $data */
    public function execute(array $data, User $actor, Request $request): AcademicSource
    {
        $activeRole = $this->roles->resolve($request);
        if ($activeRole?->role->codigo !== RoleCode::Coordinator->value || $activeRole->carrera_id === null) {
            abort(403);
        }

        return DB::transaction(function () use ($actor, $activeRole, $data, $request): AcademicSource {
            $source = AcademicSource::query()->create([
                'carrera_id' => $activeRole->carrera_id,
                'nombre' => $data['nombre'],
                'descripcion' => $data['description'] ?? null,
                'notas_internas' => $data['internal_notes'] ?? null,
                'activo' => true,
            ]);

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole->id,
                action: 'fuente.creada',
                resourceType: 'fuente_academica',
                resourceId: $source->id,
                result: 'exito',
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $source;
        });
    }
}
