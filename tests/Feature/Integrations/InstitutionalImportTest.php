<?php

namespace Tests\Feature\Integrations;

use App\Models\User;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Integrations\Domain\Contracts\AcademicRecordMapper;
use App\Modules\Integrations\Domain\Contracts\ImportReconciler;
use App\Modules\Integrations\Domain\Contracts\InstitutionalDataReader;
use App\Modules\Integrations\Domain\Data\InstitutionalBatch;
use App\Modules\Integrations\Domain\Data\InstitutionalRecord;
use App\Modules\Integrations\Domain\Exceptions\InstitutionalReaderUnavailable;
use App\Modules\Integrations\Infrastructure\Jobs\SimulateInstitutionalImportJob;
use App\Modules\Integrations\Infrastructure\Persistence\Models\ImportConflict;
use App\Modules\Integrations\Infrastructure\Persistence\Models\ImportExecution;
use App\Modules\Integrations\Infrastructure\Persistence\Models\ImportItem;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Support\CanonicalHasher;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class InstitutionalImportTest extends TestCase
{
    use DatabaseMigrations;

    private User $administrator;

    private RoleAssignment $administratorContext;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
        $this->administrator = User::query()->where('email', 'admin@silabos.test')->firstOrFail();
        $this->administratorContext = $this->administrator->roleAssignments()->firstOrFail();
    }

    public function test_cu_18_simulation_is_idempotent_classifies_fixture_and_never_mutates_academic_data(): void
    {
        Queue::fake();
        $academicBefore = $this->academicSnapshot();
        $this->actingAsAdministrator()
            ->get(route('admin.integrations.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Integrations/Index')
                ->where('environment.enabled', true)
                ->where('environment.fixture_only', true)
                ->where('selected_execution', null));

        $key = (string) Str::uuid();
        $this->post(route('admin.integrations.store'), [
            'profile' => 'baseline',
            'idempotency_key' => $key,
        ])->assertRedirect();
        $this->post(route('admin.integrations.store'), [
            'profile' => 'baseline',
            'idempotency_key' => $key,
        ])->assertRedirect();

        $this->assertDatabaseCount('ejecuciones_importacion', 1);
        $this->assertDatabaseCount('ejecuciones_trabajo', 1);
        Queue::assertPushed(SimulateInstitutionalImportJob::class, 1);
        $execution = ImportExecution::query()->firstOrFail();
        $this->runJob($execution);

        $execution->refresh();
        $this->assertSame('completed', $execution->estado);
        $this->assertSame(5, $execution->total_items);
        $this->assertSame(4, $execution->items_validos);
        $this->assertSame(1, $execution->items_rechazados);
        $this->assertSame(2, $execution->conflictos);
        $this->assertSame(1, $execution->altas_propuestas);
        $this->assertSame(0, $execution->cambios_propuestos);
        $this->assertSame(1, $execution->sin_cambio_propuesto);
        $this->assertDatabaseCount('items_importacion', 5);
        // Solo la referencia externa duplicada sigue siendo conflicto: con PV-10
        // confirmado, la identidad por `cod_oculto` resuelve el resto.
        $this->assertDatabaseCount('conflictos_importacion', 2);
        $this->assertDatabaseHas('items_importacion', [
            'numero_fila' => 1,
            'resultado' => 'unchanged',
            'accion_propuesta' => 'none',
            'codigo_motivo' => 'institutional_identity_matched',
        ]);
        $this->assertDatabaseHas('items_importacion', [
            'numero_fila' => 2,
            'resultado' => 'new',
            'accion_propuesta' => 'create',
            'codigo_motivo' => 'institutional_identity_absent',
        ]);
        $this->assertSame(2, ImportItem::query()->where('codigo_motivo', 'duplicate_external_reference')->count());
        $this->assertDatabaseHas('items_importacion', [
            'numero_fila' => 5,
            'resultado' => 'rejected',
            'codigo_motivo' => 'invalid_name',
        ]);
        $this->assertSame($academicBefore, $this->academicSnapshot());
        $this->assertDatabaseHas('notificaciones_internas', [
            'usuario_id' => $this->administrator->id,
            'tipo' => 'institutional_import.completed',
        ]);
        $this->assertDatabaseHas('eventos_auditoria', [
            'accion' => 'institutional_import.simulation_completed',
            'resultado' => 'success',
        ]);

        $response = $this->get(route('admin.integrations.index', [
            'run' => $execution->id,
            'q' => 'Escenario académico sintético',
        ]));
        $response->assertOk()
            ->assertDontSee('fixture-existing-subject')
            ->assertDontSee('payload_original')
            ->assertDontSee('version_lector')
            ->assertInertia(fn (Assert $page) => $page
                ->where('filters.q', 'Escenario académico sintético')
                ->where('executions.total', 1)
                ->where('selected_execution.status', 'completed')
                ->where('selected_execution.total_items', 5)
                ->has('items.data', 5)
                ->where('items.data.0.name', 'Arquitectura de Software')
                ->where('items.data.4.name', null));
    }

    public function test_only_active_administrator_context_can_operate_imports(): void
    {
        Queue::fake();
        $teacher = User::query()->where('email', 'docente@silabos.test')->firstOrFail();
        $teacherContext = $teacher->roleAssignments()->firstOrFail();
        $this->actingAs($teacher)
            ->withSession(['active_role_assignment_id' => $teacherContext->id])
            ->get(route('admin.integrations.index'))
            ->assertForbidden();
        $this->post(route('admin.integrations.store'), [
            'profile' => 'baseline',
            'idempotency_key' => (string) Str::uuid(),
        ])->assertForbidden();
        $this->assertDatabaseCount('ejecuciones_importacion', 0);

        $this->administrator->update(['active' => false, 'deactivated_at' => now()]);
        $this->actingAs($this->administrator)
            ->withSession(['active_role_assignment_id' => $this->administratorContext->id])
            ->get(route('admin.integrations.index'))
            ->assertRedirect(route('login'));
        $this->assertDatabaseCount('ejecuciones_importacion', 0);
    }

    public function test_conflict_exclusion_requires_justification_is_idempotent_and_becomes_immutable(): void
    {
        Queue::fake();
        $execution = $this->requestAndRun();
        $conflict = ImportConflict::query()->orderBy('created_at')->firstOrFail();

        $this->post(route('admin.integrations.conflicts.exclude', $conflict), [
            'justification' => 'Muy breve',
        ])->assertSessionHasErrors('justification');
        $justification = 'La fila se excluye porque la identidad institucional no está confirmada.';
        $this->post(route('admin.integrations.conflicts.exclude', $conflict), [
            'justification' => $justification,
        ])->assertRedirect();
        $this->post(route('admin.integrations.conflicts.exclude', $conflict), [
            'justification' => $justification,
        ])->assertRedirect();

        $conflict->refresh();
        $this->assertSame('resolved', $conflict->estado);
        $this->assertSame('exclude', $conflict->decision);
        $this->assertSame($justification, $conflict->justificacion);
        $this->assertSame($this->administrator->id, $conflict->resuelto_por);
        $this->assertSame(1, DB::table('eventos_auditoria')
            ->where('accion', 'institutional_import.conflict_excluded')->count());
        $this->assertSame('completed', $execution->fresh()->estado);

        try {
            DB::table('conflictos_importacion')->where('id', $conflict->id)->update([
                'justificacion' => 'Intento de reescritura de una decisión ya fijada.',
            ]);
            $this->fail('PostgreSQL permitió reescribir una decisión de conflicto.');
        } catch (QueryException) {
            $this->assertSame($justification, $conflict->fresh()->justificacion);
        }
    }

    public function test_hostile_text_is_rejected_and_never_exposed_or_applied(): void
    {
        Queue::fake();
        $academicBefore = $this->academicSnapshot();
        $reader = new class implements InstitutionalDataReader
        {
            public function source(): string
            {
                return 'hostile-fixture';
            }

            public function version(): string
            {
                return 'hostile-fixture-v1';
            }

            public function read(string $profile): InstitutionalBatch
            {
                return new InstitutionalBatch($this->source(), $this->version(), $profile, [
                    new InstitutionalRecord(1, 'private-reference', 'subject', [
                        'career_code' => 'SOFTWARE',
                        'curriculum_code' => 'MALLA-SW-2024',
                        'institutional_code' => 'SW-XSS',
                        'hidden_code' => 9001,
                        'name' => '<script>window.secret = true</script>',
                        'cycle' => 7,
                        'credits' => 3,
                        'active' => true,
                    ]),
                ]);
            }
        };
        $this->app->instance(InstitutionalDataReader::class, $reader);
        $execution = $this->requestAndRun();

        $this->assertSame('completed', $execution->fresh()->estado);
        $this->assertDatabaseHas('items_importacion', [
            'ejecucion_importacion_id' => $execution->id,
            'resultado' => 'rejected',
            'codigo_motivo' => 'text_out_of_bounds',
        ]);
        $this->assertSame($academicBefore, $this->academicSnapshot());
        $this->get(route('admin.integrations.index', ['run' => $execution->id]))
            ->assertOk()
            ->assertDontSee('window.secret')
            ->assertDontSee('private-reference');
    }

    public function test_oversized_batch_fails_closed_without_partial_staging(): void
    {
        Queue::fake();
        $academicBefore = $this->academicSnapshot();
        $reader = new class implements InstitutionalDataReader
        {
            public function source(): string
            {
                return 'oversized-fixture';
            }

            public function version(): string
            {
                return 'oversized-fixture-v1';
            }

            public function read(string $profile): InstitutionalBatch
            {
                $records = [];
                for ($row = 1; $row <= 1001; $row++) {
                    $records[] = new InstitutionalRecord($row, "row-{$row}", 'subject', []);
                }

                return new InstitutionalBatch($this->source(), $this->version(), $profile, $records);
            }
        };
        $this->app->instance(InstitutionalDataReader::class, $reader);
        $execution = $this->requestExecution();
        $this->runJob($execution);

        $execution->refresh();
        $this->assertSame('failed', $execution->estado);
        $this->assertSame('import_contract_invalid', $execution->codigo_error);
        $this->assertDatabaseCount('items_importacion', 0);
        $this->assertDatabaseCount('conflictos_importacion', 0);
        $this->assertSame($academicBefore, $this->academicSnapshot());
    }

    public function test_unavailable_reader_exposes_only_safe_failure(): void
    {
        Queue::fake();
        $reader = new class implements InstitutionalDataReader
        {
            public function source(): string
            {
                return 'unavailable-source';
            }

            public function version(): string
            {
                return 'unavailable-v1';
            }

            public function read(string $profile): InstitutionalBatch
            {
                throw new InstitutionalReaderUnavailable('PASSWORD=secret host=/private/source');
            }
        };
        $this->app->instance(InstitutionalDataReader::class, $reader);
        $execution = $this->requestExecution();
        $job = new SimulateInstitutionalImportJob($execution->id);
        try {
            $job->handle(
                $reader,
                app(AcademicRecordMapper::class),
                app(ImportReconciler::class),
                app(CanonicalHasher::class),
                app(RecordAuditEvent::class),
            );
            $this->fail('El lector simulado debía estar indisponible.');
        } catch (InstitutionalReaderUnavailable $exception) {
            $job->failed($exception);
        }

        $execution->refresh();
        $this->assertSame('failed', $execution->estado);
        $this->assertSame('institutional_reader_unavailable', $execution->codigo_error);
        $this->assertStringNotContainsString('PASSWORD', (string) $execution->mensaje_error);
        $this->assertStringNotContainsString('/private/source', (string) $execution->mensaje_error);
        $this->assertDatabaseCount('items_importacion', 0);
    }

    public function test_terminal_job_is_idempotent_and_postgresql_rejects_late_staging(): void
    {
        Queue::fake();
        $execution = $this->requestAndRun();
        $this->runJob($execution);
        $this->assertDatabaseCount('items_importacion', 5);
        $this->assertDatabaseCount('conflictos_importacion', 2);

        try {
            ImportItem::query()->create([
                'ejecucion_importacion_id' => $execution->id,
                'numero_fila' => 99,
                'referencia_externa' => 'late-row',
                'tipo_entidad' => 'subject',
                'payload_original' => [],
                'huella_original' => str_repeat('a', 64),
                'payload_normalizado' => null,
                'huella_normalizada' => null,
                'resultado' => 'rejected',
                'accion_propuesta' => null,
                'codigo_motivo' => 'late_row',
            ]);
            $this->fail('PostgreSQL permitió agregar staging a una ejecución terminal.');
        } catch (QueryException) {
            $this->assertDatabaseCount('items_importacion', 5);
        }
    }

    public function test_simulation_requests_are_rate_limited_per_administrator(): void
    {
        Queue::fake();
        $this->actingAsAdministrator();
        for ($request = 1; $request <= 3; $request++) {
            $this->post(route('admin.integrations.store'), [
                'profile' => 'baseline',
                'idempotency_key' => (string) Str::uuid(),
            ])->assertRedirect();
        }
        $this->post(route('admin.integrations.store'), [
            'profile' => 'baseline',
            'idempotency_key' => (string) Str::uuid(),
        ])->assertTooManyRequests();
        $this->assertDatabaseCount('ejecuciones_importacion', 3);
    }

    public function test_disabled_driver_preserves_history_view_and_rejects_new_simulations(): void
    {
        Queue::fake();
        config()->set('integrations.institutional_import.driver', 'disabled');

        $this->actingAsAdministrator()
            ->get(route('admin.integrations.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('environment.enabled', false)
                ->where('environment.fixture_only', false));
        $this->post(route('admin.integrations.store'), [
            'profile' => 'baseline',
            'idempotency_key' => (string) Str::uuid(),
        ])->assertSessionHasErrors('profile');

        $this->assertDatabaseCount('ejecuciones_importacion', 0);
        Queue::assertNothingPushed();
    }

    private function requestAndRun(): ImportExecution
    {
        $execution = $this->requestExecution();
        $this->runJob($execution);

        return $execution;
    }

    private function requestExecution(): ImportExecution
    {
        $this->actingAsAdministrator()
            ->post(route('admin.integrations.store'), [
                'profile' => 'baseline',
                'idempotency_key' => (string) Str::uuid(),
            ])->assertRedirect();

        return ImportExecution::query()->latest('solicitado_en')->firstOrFail();
    }

    private function runJob(ImportExecution $execution): void
    {
        (new SimulateInstitutionalImportJob($execution->id))->handle(
            app(InstitutionalDataReader::class),
            app(AcademicRecordMapper::class),
            app(ImportReconciler::class),
            app(CanonicalHasher::class),
            app(RecordAuditEvent::class),
        );
    }

    /** @return array<string, list<array<string, mixed>>> */
    private function academicSnapshot(): array
    {
        $snapshot = [];
        foreach ([
            'facultades', 'campus', 'modalidades', 'periodos_academicos', 'carreras',
            'asignaciones_coordinador', 'versiones_malla', 'asignaturas',
            'requisitos_asignatura', 'ofertas_academicas', 'paralelos', 'asignaciones_docente',
        ] as $table) {
            $snapshot[$table] = DB::table($table)
                ->orderBy('id')
                ->get()
                ->map(fn (object $row): array => (array) $row)
                ->values()
                ->all();
        }

        return $snapshot;
    }

    private function actingAsAdministrator(): static
    {
        $this->actingAs($this->administrator)
            ->withSession(['active_role_assignment_id' => $this->administratorContext->id]);

        return $this;
    }
}
