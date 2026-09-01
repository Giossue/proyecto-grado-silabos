<?php

namespace App\Modules\Documents\Application\Actions;

use App\Models\User;
use App\Modules\Documents\Domain\Contracts\DocumentRenderer;
use App\Modules\Documents\Infrastructure\Jobs\GenerateSyllabusExportJob;
use App\Modules\Documents\Infrastructure\Persistence\Models\ExportArtifact;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Operations\Infrastructure\Persistence\Models\JobExecution;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Approval;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusRevision;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class RequestSyllabusExport
{
    public function __construct(
        private readonly DocumentRenderer $renderer,
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    public function execute(
        SyllabusRevision $revision,
        string $idempotencyKey,
        User $actor,
        Request $request,
    ): ExportArtifact {
        $existing = $this->existingArtifact($revision->id, $idempotencyKey, $actor);
        if ($existing !== null) {
            return $existing;
        }

        return DB::transaction(function () use ($actor, $idempotencyKey, $request, $revision): ExportArtifact {
            $syllabus = Syllabus::query()->lockForUpdate()->findOrFail($revision->silabo_id);
            $lockedRevision = SyllabusRevision::query()->lockForUpdate()->findOrFail($revision->id);
            if ($lockedRevision->silabo_id !== $syllabus->id) {
                throw ValidationException::withMessages([
                    'revision' => 'La revisión no pertenece al expediente solicitado.',
                ]);
            }

            $existing = $this->existingArtifact($lockedRevision->id, $idempotencyKey, $actor);
            if ($existing !== null) {
                return $existing;
            }
            if (! Approval::query()->where('revision_silabo_id', $lockedRevision->id)->exists()) {
                throw ValidationException::withMessages([
                    'revision' => 'Solo una revisión aprobada puede generar documentos.',
                ]);
            }

            $activeRole = $this->roles->resolve($request);
            $artifact = ExportArtifact::query()->create([
                'silabo_id' => $syllabus->id,
                'revision_silabo_id' => $lockedRevision->id,
                'version_plantilla_id' => $syllabus->version_plantilla_id,
                'version_renderizador' => $this->renderer->version(),
                'idioma' => 'es-EC',
                'clave_idempotencia' => $idempotencyKey,
                'estado' => 'pendiente',
                'solicitado_por' => $actor->id,
                'asignacion_rol_id' => $activeRole?->id,
                'solicitado_en' => now(),
            ]);
            $correlationId = $request->attributes->getString('correlation_id');
            $execution = JobExecution::query()->create([
                'tipo' => 'documento.exportacion',
                'cola' => 'documentos',
                'estado' => 'pendiente',
                'clave_idempotencia' => "documento.exportacion:{$lockedRevision->id}:{$idempotencyKey}",
                'correlacion_id' => Str::isUuid($correlationId) ? $correlationId : (string) Str::uuid(),
                'tipo_recurso' => 'artefacto_exportacion',
                'recurso_id' => $artifact->id,
                'intentos' => 0,
                'intentos_maximos' => 3,
                'progreso' => 0,
            ]);
            $artifact->update(['ejecucion_trabajo_id' => $execution->id]);
            GenerateSyllabusExportJob::dispatch($artifact->id)->afterCommit();
            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'documento.exportacion_solicitada',
                resourceType: 'artefacto_exportacion',
                resourceId: $artifact->id,
                result: 'exito',
                metadata: [
                    'revision_number' => $lockedRevision->numero_revision,
                    'renderer_version' => $artifact->version_renderizador,
                ],
                correlationId: $execution->correlacion_id,
            );

            return $artifact->refresh();
        });
    }

    private function existingArtifact(string $revisionId, string $key, User $actor): ?ExportArtifact
    {
        $artifact = ExportArtifact::query()
            ->where('revision_silabo_id', $revisionId)
            ->where('clave_idempotencia', $key)
            ->first();
        if ($artifact !== null && $artifact->solicitado_por !== $actor->id) {
            abort(403);
        }

        return $artifact;
    }
}
