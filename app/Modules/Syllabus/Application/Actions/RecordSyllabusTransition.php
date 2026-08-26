<?php

namespace App\Modules\Syllabus\Application\Actions;

use App\Models\User;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusRevision;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusTransition;

class RecordSyllabusTransition
{
    /** @param array<string, mixed> $metadata */
    public function execute(
        Syllabus $syllabus,
        ?SyllabusRevision $revision,
        string $from,
        string $to,
        string $action,
        User $actor,
        ?RoleAssignment $activeRole,
        array $metadata = [],
    ): SyllabusTransition {
        return SyllabusTransition::query()->create([
            'silabo_id' => $syllabus->id,
            'revision_silabo_id' => $revision?->id,
            'estado_origen' => $from,
            'estado_destino' => $to,
            'accion' => $action,
            'actor_usuario_id' => $actor->id,
            'asignacion_rol_id' => $activeRole?->id,
            'metadatos' => $metadata === [] ? null : $metadata,
            'ocurrido_en' => now(),
        ]);
    }
}
