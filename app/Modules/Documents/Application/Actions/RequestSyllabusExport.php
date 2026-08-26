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
                'version_renderer' => $this->renderer->version(),
                'locale' => 'es-EC',
                'clave_idempotencia' => $idempotencyKey,
                'estado' => 'pending',
                'solicitado_por' => $actor->id,
                'asignacion_rol_id' => $activeRole?->id,
                'solicitado_en' => now(),
            ]);
            $correlationId = $request->attributes->getString('correlation_id');
            $execution = JobExecution::query()->create([
                'type' => 'document.export',
                'queue_name' => 'documents',
                'status' => 'pending',
                'idempotency_key' => "document.export:{$lockedRevision->id}:{$idempotencyKey}",
                'correlation_id' => Str::isUuid($correlationId) ? $correlationId : (string) Str::uuid(),
                'resource_type' => 'export_artifact',
                'resource_id' => $artifact->id,
                'attempts' => 0,
                'max_attempts' => 3,
                'progress' => 0,
            ]);
            $artifact->update(['ejecucion_trabajo_id' => $execution->id]);
            GenerateSyllabusExportJob::dispatch($artifact->id)->afterCommit();
            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'document.export_requested',
                resourceType: 'export_artifact',
                resourceId: $artifact->id,
                result: 'success',
                metadata: [
                    'revision_number' => $lockedRevision->numero_revision,
                    'renderer_version' => $artifact->version_renderer,
                ],
                correlationId: $execution->correlation_id,
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
