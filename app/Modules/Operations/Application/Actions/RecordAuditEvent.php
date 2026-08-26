<?php

namespace App\Modules\Operations\Application\Actions;

use App\Modules\Operations\Infrastructure\Persistence\Models\AuditEvent;

class RecordAuditEvent
{
    /** @param array<string, bool|float|int|string|null> $metadata */
    public function execute(
        ?string $actorId,
        ?string $roleAssignmentId,
        string $action,
        string $resourceType,
        ?string $resourceId,
        string $result,
        array $metadata = [],
        ?string $correlationId = null,
    ): AuditEvent {
        return AuditEvent::query()->create([
            'actor_usuario_id' => $actorId,
            'asignacion_rol_id' => $roleAssignmentId,
            'accion' => $action,
            'tipo_recurso' => $resourceType,
            'recurso_id' => $resourceId,
            'resultado' => $result,
            'metadatos' => $metadata,
            'correlation_id' => $correlationId,
            'ocurrido_en' => now(),
        ]);
    }
}
