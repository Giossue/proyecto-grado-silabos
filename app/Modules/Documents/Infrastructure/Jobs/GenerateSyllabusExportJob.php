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
        $this->onQueue('documentos');
    }

    public function handle(
        DocumentRenderer $renderer,
        RecordAuditEvent $audit,
        DocumentBundleValidator $validator,
    ): void {
        $shouldContinue = DB::transaction(function (): bool {
            $artifact = ExportArtifact::query()->lockForUpdate()->find($this->artifactId);
            if ($artifact === null || $artifact->estado === 'completado') {
                return false;
            }
            $execution = JobExecution::query()->lockForUpdate()->findOrFail($artifact->ejecucion_trabajo_id);
            $artifact->update(['estado' => 'en_ejecucion']);
            $execution->update([
                'estado' => 'en_ejecucion',
                'intentos' => $execution->intentos + 1,
                'progreso' => 10,
                'iniciado_en' => $execution->iniciado_en ?? now(),
                'finalizado_en' => null,
                'codigo_error' => null,
                'mensaje_error' => null,
            ]);

            return true;
        });
        if (! $shouldContinue) {
            return;
        }

        $artifact = ExportArtifact::query()->with([
            'revision',
            'syllabus.subject',
            'syllabus.convocation.process.academicPeriod',
        ])->findOrFail($this->artifactId);
        if (! Approval::query()->where('revision_silabo_id', $artifact->revision_silabo_id)->exists()) {
            throw new RuntimeException('La revisión dejó de estar aprobada.');
        }

        $syllabus = $artifact->syllabus;
        $revision = $artifact->revision;
        $bundle = $renderer->render(new DocumentRenderInput(
            subject: $syllabus->academicSubjectName(),
            subjectCode: $syllabus->academicSubjectCode(),
            academicPeriod: $syllabus->convocation->process->academicPeriod->nombre,
            revisionNumber: $revision->numero_revision,
            revisionFingerprint: $revision->huella_sha256,
            templateId: $artifact->plantilla_id,
            generatedAt: $artifact->solicitado_en->toIso8601String(),
            locale: $artifact->idioma,
            snapshot: $revision->fotografia,
        ));
        if ($renderer->version() !== $artifact->version_renderizador) {
            throw new RuntimeException('La versión del renderer no coincide con la solicitud.');
        }
        $validator->validate($bundle);

        $basePath = "exports/{$revision->id}/{$artifact->id}";
        $docx = $this->persistObject($artifact, $bundle->docx, "{$basePath}/syllabus.docx", $syllabus->convocation->carrera_id);
        $pdf = $this->persistObject($artifact, $bundle->pdf, "{$basePath}/syllabus.pdf", $syllabus->convocation->carrera_id);

        DB::transaction(function () use ($artifact, $audit, $docx, $pdf, $revision, $syllabus): void {
            $locked = ExportArtifact::query()->lockForUpdate()->findOrFail($artifact->id);
            $execution = JobExecution::query()->lockForUpdate()->findOrFail($locked->ejecucion_trabajo_id);
            if ($locked->estado === 'completado') {
                return;
            }

            $locked->update([
                'objeto_docx_id' => $docx->id,
                'objeto_pdf_id' => $pdf->id,
                'estado' => 'completado',
                'completado_en' => now(),
            ]);
            $execution->update([
                'estado' => 'completada',
                'progreso' => 100,
                'resultado' => [
                    'artifact_id' => $locked->id,
                    'docx_object_id' => $docx->id,
                    'pdf_object_id' => $pdf->id,
                ],
                'finalizado_en' => now(),
                'codigo_error' => null,
                'mensaje_error' => null,
            ]);
            InternalNotification::query()->firstOrCreate(
                [
                    'usuario_id' => $locked->solicitado_por,
                    'clave_deduplicacion' => "documento.exportacion.completada:{$locked->id}",
                ],
                [
                    'tipo' => 'documento.exportacion.completada',
                    'titulo' => 'Documentos listos para descargar',
                    'mensaje' => "Los documentos del sílabo {$syllabus->academicSubjectName()}, revisión {$revision->numero_revision}, están disponibles.",
                    'tipo_recurso' => 'artefacto_exportacion',
                    'recurso_id' => $locked->id,
                    'notificado_en' => now(),
                ],
            );
            $audit->execute(
                actorId: null,
                roleAssignmentId: null,
                action: 'documento.exportacion_completada',
                resourceType: 'artefacto_exportacion',
                resourceId: $locked->id,
                result: 'exito',
                metadata: [
                    'revision_number' => $revision->numero_revision,
                    'docx_object_id' => $docx->id,
                    'pdf_object_id' => $pdf->id,
                ],
                correlationId: $execution->correlacion_id,
            );
        });
    }

    public function failed(Throwable $exception): void
    {
        DB::transaction(function (): void {
            $artifact = ExportArtifact::query()->lockForUpdate()->find($this->artifactId);
            if ($artifact === null || $artifact->estado === 'completado') {
                return;
            }
            $execution = JobExecution::query()->lockForUpdate()->find($artifact->ejecucion_trabajo_id);
            $artifact->update(['estado' => 'fallido']);
            if ($execution !== null) {
                $execution->update([
                    'estado' => 'fallida',
                    'progreso' => 0,
                    'resultado' => null,
                    'codigo_error' => 'exportacion_documento_fallida',
                    'mensaje_error' => 'No fue posible generar los documentos. Puede solicitar un reintento.',
                    'finalizado_en' => now(),
                ]);
                app(RecordAuditEvent::class)->execute(
                    actorId: null,
                    roleAssignmentId: null,
                    action: 'documento.exportacion_fallida',
                    resourceType: 'artefacto_exportacion',
                    resourceId: $artifact->id,
                    result: 'fallido',
                    metadata: ['error_code' => 'exportacion_documento_fallida'],
                    correlationId: $execution->correlacion_id,
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
            'estado' => 'activo',
            'propietario_usuario_id' => $artifact->solicitado_por,
            'carrera_id' => $careerId,
            'almacenado_en' => now(),
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
