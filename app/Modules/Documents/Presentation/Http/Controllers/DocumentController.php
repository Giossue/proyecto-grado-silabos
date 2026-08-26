<?php

namespace App\Modules\Documents\Presentation\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Documents\Application\Actions\RequestSyllabusExport;
use App\Modules\Documents\Infrastructure\Persistence\Models\ExportArtifact;
use App\Modules\Documents\Infrastructure\Persistence\Models\StoredObject;
use App\Modules\Documents\Presentation\Http\Requests\DownloadExportRequest;
use App\Modules\Documents\Presentation\Http\Requests\RequestSyllabusExportRequest;
use App\Modules\Documents\Presentation\Http\Requests\ViewRevisionDocumentsRequest;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusRevision;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class DocumentController extends Controller
{
    public function show(SyllabusRevision $revision, ViewRevisionDocumentsRequest $request): Response
    {
        $revision->load([
            'approval.approver:id,name',
            'syllabus.subject:id,nombre,codigo_institucional',
            'syllabus.convocation.academicPeriod:id,nombre',
        ]);
        abort_unless($revision->approval !== null, 404);
        $artifacts = ExportArtifact::query()
            ->where('revision_silabo_id', $revision->id)
            ->with(['execution', 'docxObject', 'pdfObject'])
            ->latest('solicitado_en')
            ->get();

        return Inertia::render('Syllabi/Documents', [
            'syllabus' => [
                'id' => $revision->syllabus->id,
                'subject' => $revision->syllabus->subject->nombre,
                'code' => $revision->syllabus->subject->codigo_institucional,
                'period' => $revision->syllabus->convocation->academicPeriod->nombre,
            ],
            'revision' => [
                'id' => $revision->id,
                'number' => $revision->numero_revision,
                'fingerprint' => $revision->huella_sha256,
                'approved_at' => $revision->approval->aprobado_en->toIso8601String(),
                'approved_by' => $revision->approval->approver->name,
            ],
            'artifacts' => $artifacts->map(fn (ExportArtifact $artifact): array => [
                'id' => $artifact->id,
                'status' => $artifact->estado,
                'requested_at' => $artifact->solicitado_en->toIso8601String(),
                'completed_at' => $artifact->completado_en?->toIso8601String(),
                'renderer_label' => 'Formato técnico provisional',
                'execution' => $artifact->execution === null ? null : [
                    'status' => $artifact->execution->status,
                    'progress' => $artifact->execution->progress,
                    'error_code' => $artifact->execution->error_code,
                    'error_message' => $artifact->execution->error_message,
                ],
                'files' => $artifact->estado !== 'completed' ? null : [
                    'docx_size' => $artifact->docxObject?->tamano_bytes,
                    'pdf_size' => $artifact->pdfObject?->tamano_bytes,
                ],
            ])->values(),
        ]);
    }

    public function store(
        SyllabusRevision $revision,
        RequestSyllabusExportRequest $request,
        RequestSyllabusExport $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $artifact = $action->execute(
            $revision,
            $request->string('idempotency_key')->toString(),
            $actor,
            $request,
        );

        return to_route('documents.show', $revision)
            ->with('success', $artifact->estado === 'completed'
                ? 'Los documentos de esta solicitud ya estaban disponibles.'
                : 'La generación de DOCX y PDF quedó en cola.');
    }

    public function download(
        ExportArtifact $artifact,
        string $format,
        DownloadExportRequest $request,
        ActiveRole $roles,
        RecordAuditEvent $audit,
    ): StreamedResponse {
        $object = $this->objectFor($artifact, $format);
        abort_unless($object->disco === 'private' && Storage::disk('private')->exists($object->ruta_interna), 404);
        $artifact->loadMissing('revision.syllabus.subject');
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $activeRole = $roles->resolve($request);
        $audit->execute(
            actorId: $actor->id,
            roleAssignmentId: $activeRole?->id,
            action: 'document.downloaded',
            resourceType: 'export_artifact',
            resourceId: $artifact->id,
            result: 'success',
            metadata: [
                'format' => $format,
                'revision_number' => $artifact->revision->numero_revision,
                'object_id' => $object->id,
            ],
            correlationId: $request->attributes->getString('correlation_id') ?: null,
        );
        $code = Str::slug($artifact->revision->syllabus->subject->codigo_institucional) ?: 'asignatura';
        $filename = "silabo-{$code}-revision-{$artifact->revision->numero_revision}.{$format}";

        return Storage::disk('private')->download($object->ruta_interna, $filename, [
            'Content-Type' => $object->mime,
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private function objectFor(ExportArtifact $artifact, string $format): StoredObject
    {
        $artifact->loadMissing(['docxObject', 'pdfObject']);
        $object = match ($format) {
            'docx' => $artifact->docxObject,
            'pdf' => $artifact->pdfObject,
            default => null,
        };
        abort_unless($artifact->estado === 'completed' && $object instanceof StoredObject, 404);

        return $object;
    }
}
