<?php

namespace App\Modules\Documents\Infrastructure\Jobs;

use App\Modules\Documents\Application\DocumentBundleValidator;
use App\Modules\Documents\Domain\Contracts\DocumentRenderer;
use App\Modules\Documents\Domain\Data\DocumentRenderInput;
use App\Modules\Documents\Domain\Data\RenderedDocument;
use App\Modules\Documents\Infrastructure\Persistence\Models\ExportArtifact;
use App\Modules\Documents\Infrastructure\Persistence\Models\StoredObject;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Operations\Infrastructure\Persistence\Models\InternalNotification;
use App\Modules\Operations\Infrastructure\Persistence\Models\JobExecution;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Approval;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Throwable;

class GenerateSyllabusExportJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public int $timeout = 120;

    /** @var list<int> */
    public array $backoff = [5, 30, 120];

    public function __construct(public readonly string $artifactId)
    {
        $this->onQueue('documents');
    }

    public function handle(
        DocumentRenderer $renderer,
        RecordAuditEvent $audit,
        DocumentBundleValidator $validator,
    ): void {
        $shouldContinue = DB::transaction(function (): bool {
            $artifact = ExportArtifact::query()->lockForUpdate()->find($this->artifactId);
            if ($artifact === null || $artifact->estado === 'completed') {
                return false;
            }
            $execution = JobExecution::query()->lockForUpdate()->findOrFail($artifact->ejecucion_trabajo_id);
            $artifact->update(['estado' => 'running']);
            $execution->update([
                'status' => 'running',
                'attempts' => $execution->attempts + 1,
                'progress' => 10,
                'started_at' => $execution->started_at ?? now(),
                'finished_at' => null,
                'error_code' => null,
                'error_message' => null,
            ]);

            return true;
        });
        if (! $shouldContinue) {
            return;
        }

        $artifact = ExportArtifact::query()->with([
            'revision',
            'syllabus.subject',
            'syllabus.convocation.academicPeriod',
        ])->findOrFail($this->artifactId);
        if (! Approval::query()->where('revision_silabo_id', $artifact->revision_silabo_id)->exists()) {
            throw new RuntimeException('La revisión dejó de estar aprobada.');
        }

        $syllabus = $artifact->syllabus;
        $revision = $artifact->revision;
        $bundle = $renderer->render(new DocumentRenderInput(
            subject: $syllabus->academicSubjectName(),
            subjectCode: $syllabus->academicSubjectCode(),
            academicPeriod: $syllabus->convocation->academicPeriod->nombre,
            revisionNumber: $revision->numero_revision,
            revisionFingerprint: $revision->huella_sha256,
            templateVersionId: $artifact->version_plantilla_id,
            generatedAt: $artifact->solicitado_en->toIso8601String(),
            locale: $artifact->locale,
            snapshot: $revision->snapshot,
        ));
        if ($renderer->version() !== $artifact->version_renderer) {
            throw new RuntimeException('La versión del renderer no coincide con la solicitud.');
        }
        $validator->validate($bundle);

        $basePath = "exports/{$revision->id}/{$artifact->id}";
        $docx = $this->persistObject($artifact, $bundle->docx, "{$basePath}/syllabus.docx", $syllabus->convocation->carrera_id);
        $pdf = $this->persistObject($artifact, $bundle->pdf, "{$basePath}/syllabus.pdf", $syllabus->convocation->carrera_id);

        DB::transaction(function () use ($artifact, $audit, $docx, $pdf, $revision, $syllabus): void {
            $locked = ExportArtifact::query()->lockForUpdate()->findOrFail($artifact->id);
            $execution = JobExecution::query()->lockForUpdate()->findOrFail($locked->ejecucion_trabajo_id);
            if ($locked->estado === 'completed') {
                return;
            }

            $locked->update([
                'objeto_docx_id' => $docx->id,
                'objeto_pdf_id' => $pdf->id,
                'estado' => 'completed',
                'completado_en' => now(),
            ]);
            $execution->update([
                'status' => 'completed',
                'progress' => 100,
                'result' => [
                    'artifact_id' => $locked->id,
                    'docx_object_id' => $docx->id,
                    'pdf_object_id' => $pdf->id,
                ],
                'finished_at' => now(),
                'error_code' => null,
                'error_message' => null,
            ]);
            InternalNotification::query()->firstOrCreate(
                [
                    'usuario_id' => $locked->solicitado_por,
                    'clave_deduplicacion' => "document.export.completed:{$locked->id}",
                ],
                [
                    'tipo' => 'document.export.completed',
                    'titulo' => 'Documentos listos para descargar',
                    'mensaje' => "Los documentos del sílabo {$syllabus->academicSubjectName()}, revisión {$revision->numero_revision}, están disponibles.",
                    'tipo_recurso' => 'export_artifact',
                    'recurso_id' => $locked->id,
                    'creado_en' => now(),
                ],
            );
            $audit->execute(
                actorId: null,
                roleAssignmentId: null,
                action: 'document.export_completed',
                resourceType: 'export_artifact',
                resourceId: $locked->id,
                result: 'success',
                metadata: [
                    'revision_number' => $revision->numero_revision,
                    'docx_object_id' => $docx->id,
                    'pdf_object_id' => $pdf->id,
                ],
                correlationId: $execution->correlation_id,
            );
        });
    }

    public function failed(Throwable $exception): void
    {
        DB::transaction(function (): void {
            $artifact = ExportArtifact::query()->lockForUpdate()->find($this->artifactId);
            if ($artifact === null || $artifact->estado === 'completed') {
                return;
            }
            $execution = JobExecution::query()->lockForUpdate()->find($artifact->ejecucion_trabajo_id);
            $artifact->update(['estado' => 'failed']);
            if ($execution !== null) {
                $execution->update([
                    'status' => 'failed',
                    'progress' => 0,
                    'result' => null,
                    'error_code' => 'document_export_failed',
                    'error_message' => 'No fue posible generar los documentos. Puede solicitar un reintento.',
                    'finished_at' => now(),
                ]);
                app(RecordAuditEvent::class)->execute(
                    actorId: null,
                    roleAssignmentId: null,
                    action: 'document.export_failed',
                    resourceType: 'export_artifact',
                    resourceId: $artifact->id,
                    result: 'failed',
                    metadata: ['error_code' => 'document_export_failed'],
                    correlationId: $execution->correlation_id,
                );
            }
        });
    }

    private function persistObject(
        ExportArtifact $artifact,
        RenderedDocument $document,
        string $path,
        string $careerId,
    ): StoredObject {
        $attributes = [
            'nombre_logico' => "silabo-revision-{$artifact->revision->numero_revision}.{$document->extension}",
            'mime' => $document->mime,
            'tamano_bytes' => $document->size(),
            'huella_sha256' => $document->fingerprint(),
            'clasificacion' => 'syllabus_export',
            'estado' => 'active',
            'propietario_usuario_id' => $artifact->solicitado_por,
            'carrera_id' => $careerId,
            'creado_en' => now(),
        ];
        $existing = StoredObject::query()->where('disco', 'private')->where('ruta_interna', $path)->first();
        if ($existing !== null) {
            $this->assertObjectMatches($existing, $document);
        }

        Storage::disk('private')->put($path, $document->bytes);
        $object = StoredObject::query()->firstOrCreate(
            ['disco' => 'private', 'ruta_interna' => $path],
            $attributes,
        );
        $this->assertObjectMatches($object, $document);

        return $object;
    }

    private function assertObjectMatches(StoredObject $object, RenderedDocument $document): void
    {
        if ($object->mime !== $document->mime
            || $object->tamano_bytes !== $document->size()
            || ! hash_equals($object->huella_sha256, $document->fingerprint())) {
            throw new RuntimeException('El objeto privado existente no coincide con la exportación esperada.');
        }
    }
}
