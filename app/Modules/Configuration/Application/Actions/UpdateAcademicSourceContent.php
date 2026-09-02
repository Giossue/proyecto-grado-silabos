<?php

namespace App\Modules\Configuration\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\AcademicSource;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\ProcessLocks;
use App\Support\CanonicalHasher;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class UpdateAcademicSourceContent
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly ProcessLocks $locks,
        private readonly CanonicalHasher $hasher,
    ) {}

    public function execute(AcademicSource $source, ?string $content, User $actor, Request $request): AcademicSource
    {
        $activeRole = $this->roles->resolve($request);
        // Con una convocatoria en curso los sílabos se apoyan en las fuentes: se pausa antes.
        $this->locks->assertCareerEditable($source->carrera_id);

        return DB::transaction(function () use ($actor, $activeRole, $content, $request, $source): AcademicSource {
            $locked = AcademicSource::query()->whereKey($source->id)->lockForUpdate()->firstOrFail();
            $locked->update(['contenido' => $content]);

            // La auditoría registra la huella, no el documento: basta para probar qué
            // contenido regía sin copiar la fuente completa al historial.
            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'fuente.contenido_actualizado',
                resourceType: 'fuente_academica',
                resourceId: $locked->id,
                result: 'exito',
                metadata: ['fingerprint' => $content === null ? null : $this->hasher->hash($content)],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $locked;
        });
    }
}
