<?php

namespace App\Modules\Configuration\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\AcademicSource;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SourceVersion;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CreateAcademicSource
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    /** @param array<string, mixed> $data */
    public function execute(array $data, User $actor, Request $request): SourceVersion
    {
        $activeRole = $this->roles->resolve($request);
        $careerId = $activeRole?->role->codigo === RoleCode::Coordinator->value
            ? $activeRole->carrera_id
            : ($data['career_id'] ?? null);

        if (! is_string($careerId)) {
            throw ValidationException::withMessages(['career_id' => 'Seleccione la carrera de la fuente.']);
        }

        return DB::transaction(function () use ($actor, $careerId, $activeRole, $data, $request): SourceVersion {
            $source = AcademicSource::query()->create([
                'carrera_id' => $careerId,
                'nombre' => $data['name'],
                'tipo' => $data['type'],
                'autoridad' => $data['authority'],
                'responsable' => $data['responsible'],
                'descripcion' => $data['description'] ?? null,
                'activo' => true,
            ]);
            $version = SourceVersion::query()->create([
                'fuente_academica_id' => $source->id,
                'numero_version' => 1,
                'estado' => 'draft',
                'vigente_desde' => $data['valid_from'] ?? null,
                'vigente_hasta' => $data['valid_until'] ?? null,
            ]);

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'source.created',
                resourceType: 'academic_source',
                resourceId: $source->id,
                result: 'success',
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $version;
        });
    }
}
