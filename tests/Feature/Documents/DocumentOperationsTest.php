<?php

namespace Tests\Feature\Documents;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\Curriculum;
use App\Modules\Academic\Infrastructure\Persistence\Models\Faculty;
use App\Modules\Academic\Infrastructure\Persistence\Models\Subject;
use App\Modules\Academic\Infrastructure\Persistence\Models\TeacherAssignment;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
use App\Modules\Documents\Application\DocumentBundleValidator;
use App\Modules\Documents\Domain\Contracts\DocumentRenderer;
use App\Modules\Documents\Domain\Data\DocumentRenderInput;
use App\Modules\Documents\Infrastructure\Jobs\GenerateSyllabusExportJob;
use App\Modules\Documents\Infrastructure\Persistence\Models\ExportArtifact;
use App\Modules\Documents\Infrastructure\Persistence\Models\StoredObject;
use App\Modules\Identity\Infrastructure\Persistence\Models\Role;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Operations\Application\Actions\RecordWorkflowOutbox;
use App\Modules\Operations\Infrastructure\Jobs\DeliverInternalNotificationJob;
use App\Modules\Operations\Infrastructure\Persistence\Models\AuditEvent;
use App\Modules\Operations\Infrastructure\Persistence\Models\InternalNotification;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Approval;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusCollaborator;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusRevision;
use App\Support\CanonicalHasher;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use LogicException;
use RuntimeException;
use Tests\Support\CreatesSyllabusProcess;
use Tests\TestCase;
use ZipArchive;

class DocumentOperationsTest extends TestCase
{
    use CreatesSyllabusProcess;
    use RefreshDatabase;

    private User $administrator;

    private RoleAssignment $administratorContext;

    private User $coordinator;

    private RoleAssignment $coordinatorContext;

    private User $teacher;

    private RoleAssignment $teacherContext;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
        Storage::fake('private');

        $this->administrator = User::query()->where('correo_electronico', 'admin@silabos.test')->firstOrFail();
        $this->administratorContext = $this->administrator->roleAssignments()->firstOrFail();
        $this->coordinator = User::query()->where('correo_electronico', 'coordinador@silabos.test')->firstOrFail();
        $this->coordinatorContext = $this->coordinator->roleAssignments()->firstOrFail();
        $this->teacher = User::query()->where('correo_electronico', 'docente@silabos.test')->firstOrFail();
        $this->teacherContext = $this->teacher->roleAssignments()->firstOrFail();
    }

    public function test_cp_f_only_authorized_users_request_an_approved_export_idempotently(): void
    {
        Queue::fake();
        [$syllabus, $revision] = $this->approvedRevision();
        $key = (string) Str::uuid();

        $this->actingAsTeacher()
            ->followingRedirects()
            ->get(route('documents.show', $revision))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Syllabi/Documents')
                ->where('revision.number', 1)
                ->where('artifacts', []));
        $this->actingAsTeacher()->post(route('documents.store', $revision), [
            'idempotency_key' => $key,
        ])->assertRedirect(route('documents.show', $revision));
        $this->actingAsTeacher()->post(route('documents.store', $revision), [
            'idempotency_key' => $key,
        ])->assertRedirect(route('documents.show', $revision));

        $this->assertDatabaseCount('artefactos_exportacion', 1);
        $this->assertDatabaseCount('ejecuciones_trabajo', 1);
        Queue::assertPushed(GenerateSyllabusExportJob::class, 1);
        $artifact = ExportArtifact::query()->firstOrFail();
        $this->assertSame($revision->id, $artifact->revision_silabo_id);
        $this->assertSame($syllabus->plantilla_id, $artifact->plantilla_id);

        $outsider = User::factory()->create();
        $outsiderContext = RoleAssignment::query()->create([
            'usuario_id' => $outsider->id,
            'rol_id' => Role::query()->where('codigo', 'docente')->valueOrFail('id'),
            'carrera_id' => $this->teacherContext->carrera_id,
            'vigente_desde' => now()->subDay(),
            'activo' => true,
        ]);
        $this->actingAs($outsider)
            ->withSession(['active_role_assignment_id' => $outsiderContext->id])
            ->followingRedirects()
            ->get(route('documents.show', $revision))
            ->assertForbidden();
        $this->actingAsAdministrator()->get(route('documents.show', $revision))->assertForbidden();

        $unapproved = SyllabusRevision::query()->create([
            'silabo_id' => $syllabus->id,
            'revision_anterior_id' => $revision->id,
            'numero_revision' => 2,
            'clave_idempotencia' => (string) Str::uuid(),
            'version_bloqueo_origen' => 2,
            'fotografia' => $revision->fotografia,
            'huella_sha256' => $revision->huella_sha256,
            'enviado_por' => $this->teacher->id,
            'enviado_en' => now(),
        ]);
        $this->actingAsTeacher()->post(route('documents.store', $unapproved), [
            'idempotency_key' => (string) Str::uuid(),
        ])->assertSessionHasErrors('revision');
        $this->assertDatabaseCount('artefactos_exportacion', 1);
    }

    public function test_cp_f_job_generates_consistent_private_documents_and_reauthorizes_download(): void
    {
        Queue::fake();
        [$syllabus, $revision] = $this->approvedRevision();
        $this->actingAsTeacher()->post(route('documents.store', $revision), [
            'idempotency_key' => (string) Str::uuid(),
        ]);
        $artifact = ExportArtifact::query()->firstOrFail();
        $job = new GenerateSyllabusExportJob($artifact->id);
        $job->handle(
            app(DocumentRenderer::class),
            app(RecordAuditEvent::class),
            app(DocumentBundleValidator::class),
        );

        $artifact->refresh()->load(['docxObject', 'pdfObject', 'execution']);
        $this->assertSame('completado', $artifact->estado);
        $this->assertSame('completada', $artifact->execution->estado);
        $this->assertSame(100, $artifact->execution->progreso);
        $this->assertDatabaseCount('objetos_almacenados', 2);
        $docx = $artifact->docxObject;
        $pdf = $artifact->pdfObject;
        $this->assertInstanceOf(StoredObject::class, $docx);
        $this->assertInstanceOf(StoredObject::class, $pdf);
        Storage::disk('private')->assertExists($docx->ruta_interna);
        Storage::disk('private')->assertExists($pdf->ruta_interna);
        $docxBytes = Storage::disk('private')->get($docx->ruta_interna);
        $pdfBytes = Storage::disk('private')->get($pdf->ruta_interna);
        $this->assertSame(hash('sha256', $docxBytes), $docx->huella_sha256);
        $this->assertSame(hash('sha256', $pdfBytes), $pdf->huella_sha256);
        $this->assertStringStartsWith('%PDF-1.4', $pdfBytes);
        $this->assertStringEndsWith("%%EOF\n", $pdfBytes);
        $this->assertStringContainsString($revision->huella_sha256, $pdfBytes);
        $this->assertStringContainsString('Contenido academico verificable', $pdfBytes);

        $zip = new ZipArchive;
        $this->assertTrue($zip->open(Storage::disk('private')->path($docx->ruta_interna)) === true);
        foreach (['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml'] as $entry) {
            $this->assertNotFalse($zip->locateName($entry));
        }
        $documentXml = $zip->getFromName('word/document.xml');
        $zip->close();
        $this->assertIsString($documentXml);
        $this->assertStringContainsString($revision->huella_sha256, $documentXml);
        $this->assertStringContainsString('Contenido academico verificable', $documentXml);

        $input = new DocumentRenderInput(
            subject: $syllabus->subject()->valueOrFail('nombre'),
            subjectCode: $syllabus->subject()->valueOrFail('codigo_institucional'),
            academicPeriod: $syllabus->convocation->process->academicPeriod()->valueOrFail('nombre'),
            revisionNumber: $revision->numero_revision,
            revisionFingerprint: $revision->huella_sha256,
            templateId: $syllabus->plantilla_id,
            generatedAt: $artifact->solicitado_en->toIso8601String(),
            locale: 'es-EC',
            snapshot: $revision->fotografia,
        );
        $firstBundle = app(DocumentRenderer::class)->render($input);
        $secondBundle = app(DocumentRenderer::class)->render($input);
        $this->assertSame($firstBundle->docx->fingerprint(), $secondBundle->docx->fingerprint());
        $this->assertSame($firstBundle->pdf->fingerprint(), $secondBundle->pdf->fingerprint());

        $job->handle(
            app(DocumentRenderer::class),
            app(RecordAuditEvent::class),
            app(DocumentBundleValidator::class),
        );
        $this->assertDatabaseCount('objetos_almacenados', 2);
        $this->assertSame($docxBytes, Storage::disk('private')->get($docx->ruta_interna));
        $this->assertDatabaseHas('notificaciones_internas', [
            'usuario_id' => $this->teacher->id,
            'tipo' => 'documento.exportacion.completada',
        ]);

        $this->actingAsTeacher()
            ->get(route('exports.download', [$artifact, 'docx']))
            ->assertOk()
            ->assertDownload('silabo-sw-601-revision-1.docx');
        $this->actingAsCoordinator()
            ->get(route('exports.download', [$artifact, 'pdf']))
            ->assertOk()
            ->assertDownload('silabo-sw-601-revision-1.pdf');
        $this->actingAsAdministrator()->get(route('exports.download', [$artifact, 'pdf']))->assertForbidden();

        try {
            $artifact->update(['estado' => 'fallido']);
            $this->fail('El modelo permitió modificar un artefacto completado.');
        } catch (LogicException) {
            $this->assertSame('completado', $artifact->fresh()->estado);
        }
        try {
            DB::transaction(fn () => DB::table('objetos_almacenados')
                ->where('id', $docx->id)->update(['nombre_logico' => 'alterado.docx']));
            $this->fail('PostgreSQL permitió reescribir un objeto publicado.');
        } catch (QueryException) {
            $this->assertSame($docx->nombre_logico, $docx->fresh()->nombre_logico);
        }
    }

    public function test_cp_f_failed_export_has_safe_cause_and_admin_retry_preserves_attempt_count(): void
    {
        Queue::fake();
        [, $revision] = $this->approvedRevision();
        $this->actingAsTeacher()->post(route('documents.store', $revision), [
            'idempotency_key' => (string) Str::uuid(),
        ]);
        $artifact = ExportArtifact::query()->firstOrFail();
        $execution = $artifact->execution()->firstOrFail();
        $artifact->update(['estado' => 'en_ejecucion']);
        $execution->update(['estado' => 'en_ejecucion', 'intentos' => 3]);
        $secret = 'SECRET=/srv/private/documento.docx';
        (new GenerateSyllabusExportJob($artifact->id))->failed(new RuntimeException($secret));

        $execution->refresh();
        $this->assertSame('fallido', $artifact->fresh()->estado);
        $this->assertSame('fallida', $execution->estado);
        $this->assertSame(3, $execution->intentos);
        $this->assertStringNotContainsString('SECRET', (string) $execution->mensaje_error);
        $this->assertDatabaseHas('eventos_auditoria', [
            'accion' => 'documento.exportacion_fallida',
            'resultado' => 'fallido',
        ]);
        $this->actingAsAdministrator()
            ->get(route('admin.jobs.index', ['q' => 'Generación documental']))
            ->assertOk()
            ->assertDontSee($secret)
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Operations/Jobs')
                ->where('filters.q', 'Generación documental')
                ->where('executions.total', 1)
                ->where('executions.data.0.reintentable', true));
        $this->actingAsTeacher()->post(route('admin.jobs.retry', $execution))->assertForbidden();
        $this->actingAsAdministrator()->post(route('admin.jobs.retry', $execution))->assertRedirect();

        $this->assertSame('pendiente', $artifact->fresh()->estado);
        $this->assertSame('pendiente', $execution->fresh()->estado);
        $this->assertSame(3, $execution->fresh()->intentos);
        Queue::assertPushed(GenerateSyllabusExportJob::class, 2);
        $retryAudit = AuditEvent::query()->where('accion', 'trabajo.reintento_solicitado')->firstOrFail();
        $this->assertSame(3, $retryAudit->metadatos['previous_attempts']);
    }

    public function test_cp_f_outbox_delivers_one_internal_notification_and_enforces_ownership(): void
    {
        Queue::fake();
        Mail::fake();
        [$syllabus] = $this->approvedRevision();
        $recorder = app(RecordWorkflowOutbox::class);
        $key = "syllabus.approved:{$syllabus->id}";

        $first = $recorder->execute(
            $syllabus,
            'silabo.aprobado',
            $key,
            [$this->coordinator->id],
            1,
            (string) Str::uuid(),
        );
        $second = $recorder->execute(
            $syllabus,
            'silabo.aprobado',
            $key,
            [$this->coordinator->id],
            1,
            (string) Str::uuid(),
        );
        $this->assertSame($first->id, $second->id);
        Queue::assertPushed(DeliverInternalNotificationJob::class, 1);
        $job = new DeliverInternalNotificationJob($first->id);
        $job->handle();
        $job->handle();

        $this->assertDatabaseCount('notificaciones_internas', 1);
        $notification = InternalNotification::query()->firstOrFail();
        $this->assertSame($this->coordinator->id, $notification->usuario_id);
        $this->assertSame('procesado', $first->fresh()->estado);
        $this->actingAsCoordinator()
            ->followingRedirects()
            ->get(route('notifications.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Notifications/Index')
                ->where('notifications.total', 1));
        $this->actingAsTeacher()->post(route('notifications.read', $notification))->assertForbidden();
        $this->actingAsCoordinator()->post(route('notifications.read', $notification))->assertRedirect();
        $this->assertNotNull($notification->fresh()->leido_en);
        Mail::assertNothingSent();

        try {
            DB::transaction(fn () => DB::table('notificaciones_internas')
                ->where('id', $notification->id)->update(['titulo' => 'Alterado']));
            $this->fail('PostgreSQL permitió alterar una notificación entregada.');
        } catch (QueryException) {
            $this->assertSame('Sílabo aprobado', $notification->fresh()->titulo);
        }
        try {
            DB::transaction(fn () => DB::table('eventos_salientes')
                ->where('id', $first->id)->update(['contenido' => ['recipient_ids' => []]]));
            $this->fail('PostgreSQL permitió alterar el payload del outbox.');
        } catch (QueryException) {
            $this->assertSame([$this->coordinator->id], $first->fresh()->contenido['recipient_ids']);
        }
    }

    public function test_cp_f_reports_apply_career_scope_to_indicators_and_detail(): void
    {
        [$syllabus] = $this->approvedRevision();
        $other = $this->otherCareerSyllabus($syllabus->template);

        $this->actingAsCoordinator()
            ->get(route('reports.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Coordination/Reports/Index')
                ->where('indicators.total', 1)
                ->where('indicators.approved', 1)
                ->where('syllabi.total', 1)
                ->where('syllabi.data.0.id', $syllabus->id));
        $this->actingAsCoordinator()
            ->get(route('reports.index', ['convocation' => $other->convocatoria_id]))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('indicators.total', 0)
                ->where('syllabi.total', 0));
        $this->actingAsTeacher()->get(route('reports.index'))->assertForbidden();
        $this->actingAsAdministrator()->get(route('reports.index'))->assertForbidden();
    }

    public function test_cp_f_only_administrator_reads_safe_append_only_audit(): void
    {
        $fingerprint = str_repeat('f', 64);
        $event = AuditEvent::query()->create([
            'actor_usuario_id' => $this->coordinator->id,
            'asignacion_rol_id' => $this->coordinatorContext->id,
            'accion' => 'syllabus.approved',
            'tipo_recurso' => 'approval',
            'recurso_id' => (string) Str::uuid(),
            'resultado' => 'exito',
            'metadatos' => [
                'revision_number' => 2,
                'fingerprint' => $fingerprint,
                'approval_id' => (string) Str::uuid(),
            ],
            'correlation_id' => (string) Str::uuid(),
            'ocurrido_en' => now(),
        ]);

        $this->actingAsAdministrator()
            ->get(route('admin.audit.index', ['search' => 'syllabus.approved']))
            ->assertOk()
            ->assertDontSee($fingerprint)
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Operations/Audit')
                ->where('filters.search', 'syllabus.approved')
                ->where('events.total', 1)
                ->where('events.data.0.details.0.label', 'Número de revisión')
                ->where('events.data.0.details.0.value', 2));
        $this->actingAsTeacher()->get(route('admin.audit.index'))->assertForbidden();
        $this->actingAsCoordinator()->get(route('admin.audit.index'))->assertForbidden();

        try {
            $event->update(['resultado' => 'fallida']);
            $this->fail('El modelo permitió modificar auditoría histórica.');
        } catch (LogicException) {
            $this->assertSame('exito', $event->fresh()->resultado);
        }
        try {
            DB::transaction(fn () => DB::table('eventos_auditoria')
                ->where('id', $event->id)->update(['resultado' => 'fallida']));
            $this->fail('PostgreSQL permitió modificar auditoría histórica.');
        } catch (QueryException) {
            $this->assertSame('exito', $event->fresh()->resultado);
        }
    }

    /** @return array{Syllabus, SyllabusRevision} */
    private function approvedRevision(): array
    {
        $career = Career::query()->firstOrFail();
        $subject = Subject::query()->firstOrFail();
        $version = SyllabusTemplate::query()->create([
            'nombre' => 'Plantilla documental CP-F',
            'activo' => true,
            'mapeo_documento' => ['renderer' => 'baseline'],
        ]);
        $convocation = Convocation::query()->create([
            'carrera_id' => $career->id,
            'proceso_id' => $this->openSyllabusProcess($version->id)->id,
            'estado' => 'abierta',
        ]);
        $syllabus = Syllabus::query()->create([
            'convocatoria_id' => $convocation->id,
            'asignatura_id' => $subject->id,
            'malla_id' => $subject->malla_id,
            'plantilla_id' => $version->id,
            'estado' => 'aprobado',
            'version_bloqueo' => 2,
            'porcentaje_completitud' => 100,
            'iniciado_en' => now()->subDay(),
            'guardado_en' => now(),
        ]);
        $teacherAssignment = TeacherAssignment::query()->where('usuario_id', $this->teacher->id)->firstOrFail();
        SyllabusCollaborator::query()->create([
            'silabo_id' => $syllabus->id,
            'usuario_id' => $this->teacher->id,
            'asignacion_docente_id' => $teacherAssignment->id,
        ]);
        $snapshot = [
            'schema_version' => 1,
            'template_id' => $version->id,
            'sections' => [[
                'key' => 'general',
                'title' => 'Información general',
                'blocks' => [[
                    'key' => 'contenido',
                    'title' => 'Contenido académico',
                    'fields' => [[
                        'key' => 'descripcion',
                        'label' => 'Descripción',
                        'type' => 'text',
                        'inherited' => false,
                        'value' => 'Contenido academico verificable',
                        'rows' => [],
                    ]],
                ]],
            ]],
        ];
        $revision = SyllabusRevision::query()->create([
            'silabo_id' => $syllabus->id,
            'numero_revision' => 1,
            'clave_idempotencia' => (string) Str::uuid(),
            'version_bloqueo_origen' => 1,
            'fotografia' => $snapshot,
            'huella_sha256' => app(CanonicalHasher::class)->hash($snapshot),
            'enviado_por' => $this->teacher->id,
            'enviado_en' => now()->subMinute(),
        ]);
        Approval::query()->create([
            'silabo_id' => $syllabus->id,
            'revision_silabo_id' => $revision->id,
            'clave_idempotencia' => (string) Str::uuid(),
            'huella_sha256' => hash('sha256', $revision->huella_sha256),
            'aprobado_por' => $this->coordinator->id,
            'aprobado_en' => now(),
        ]);

        return [$syllabus->fresh(), $revision->fresh()];
    }

    private function otherCareerSyllabus(SyllabusTemplate $template): Syllabus
    {
        $faculty = Faculty::query()->firstOrFail();
        $career = Career::query()->create([
            'facultad_id' => $faculty->id,
            'codigo_institucional' => 'OTRA-CP-F',
            'nombre' => 'Otra carrera CP-F',
            'activo' => true,
        ]);
        $curriculum = Curriculum::query()->create([
            'carrera_id' => $career->id,
            'codigo' => 'OTRA-MALLA-CP-F',
            'estado' => 'activa',
        ]);
        $subject = Subject::query()->create([
            'malla_id' => $curriculum->id,
            'codigo_institucional' => 'OTRA-101',
            'nombre' => 'Asignatura fuera de alcance',
            'activo' => true,
        ]);
        $convocation = Convocation::query()->create([
            'carrera_id' => $career->id,
            'proceso_id' => $this->openSyllabusProcess($template->id)->id,
            'estado' => 'abierta',
        ]);

        return Syllabus::query()->create([
            'convocatoria_id' => $convocation->id,
            'asignatura_id' => $subject->id,
            'malla_id' => $curriculum->id,
            'plantilla_id' => $template->id,
            'estado' => 'aprobado',
            'version_bloqueo' => 2,
            'porcentaje_completitud' => 100,
            'iniciado_en' => now(),
            'guardado_en' => now(),
        ]);
    }

    private function actingAsAdministrator(): static
    {
        $this->actingAs($this->administrator)
            ->withSession(['active_role_assignment_id' => $this->administratorContext->id]);

        return $this;
    }

    private function actingAsCoordinator(): static
    {
        $this->actingAs($this->coordinator)
            ->withSession(['active_role_assignment_id' => $this->coordinatorContext->id]);

        return $this;
    }

    private function actingAsTeacher(): static
    {
        $this->actingAs($this->teacher)
            ->withSession(['active_role_assignment_id' => $this->teacherContext->id]);

        return $this;
    }
}
