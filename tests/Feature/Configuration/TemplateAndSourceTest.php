<?php

namespace Tests\Feature\Configuration;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\Faculty;
use App\Modules\Configuration\Infrastructure\Persistence\Models\AcademicSource;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SourceConflict;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SourceFragment;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SourceVersion;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateVersion;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use LogicException;
use Tests\TestCase;

class TemplateAndSourceTest extends TestCase
{
    use RefreshDatabase;

    private User $administrator;

    private RoleAssignment $administratorContext;

    private User $coordinator;

    private RoleAssignment $coordinatorContext;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(DatabaseSeeder::class);
        $this->administrator = User::query()->where('email', 'admin@silabos.test')->firstOrFail();
        $this->administratorContext = $this->administrator->roleAssignments()->firstOrFail();
        $this->coordinator = User::query()->where('email', 'coordinador@silabos.test')->firstOrFail();
        $this->coordinatorContext = $this->coordinator->roleAssignments()->firstOrFail();
    }

    public function test_administrator_creates_baseline_template_with_twelve_areas(): void
    {
        $this->actingAsAdministrator()
            ->post(route('admin.templates.store'), [
                'name' => 'Plantilla Software',
                'description' => 'Prototipo estructurado para validación.',
            ])
            ->assertRedirect();

        $version = TemplateVersion::query()->firstOrFail();
        $this->assertSame('draft', $version->estado);
        $this->assertCount(12, $version->sections()->get());
        $this->assertCount(12, $version->fields()->get());

        $this->actingAsAdministrator()
            ->get(route('admin.templates.show', $version))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Templates/Show')
                ->has('templateVersion.sections', 12)
                ->where('templateVersion.state', 'draft'));
    }

    public function test_non_administrator_cannot_manage_templates(): void
    {
        $this->actingAsCoordinator()
            ->get(route('admin.templates.index'))
            ->assertForbidden();
    }

    public function test_publishing_calculates_fingerprint_and_database_blocks_mutation(): void
    {
        $version = $this->createTemplate();

        $this->actingAsAdministrator()
            ->post(route('admin.templates.publish', $version))
            ->assertRedirect()
            ->assertSessionHas('success');

        $published = $version->fresh();
        $this->assertSame('published', $published->estado);
        $this->assertMatchesRegularExpression('/^[a-f0-9]{64}$/', $published->huella_sha256);
        $field = $published->fields()->firstOrFail();

        try {
            $field->update(['etiqueta' => 'Mutación por modelo']);
            $this->fail('El modelo permitió modificar un campo publicado.');
        } catch (LogicException) {
            $this->assertTrue(true);
        }

        $this->expectException(QueryException::class);
        DB::table('definiciones_campo')->where('id', $field->id)->update(['etiqueta' => 'Mutación SQL']);
    }

    public function test_published_template_is_cloned_to_new_draft_identity(): void
    {
        $version = $this->createTemplate();
        $this->actingAsAdministrator()->post(route('admin.templates.publish', $version));

        $this->actingAsAdministrator()
            ->post(route('admin.templates.clone', $version))
            ->assertRedirect();

        $clone = TemplateVersion::query()->where('id', '!=', $version->id)->firstOrFail();
        $this->assertSame('draft', $clone->estado);
        $this->assertSame(2, $clone->numero_version);
        $this->assertCount(12, $clone->fields()->get());
        $this->assertNotEqualsCanonicalizing(
            $version->fields()->pluck('id')->all(),
            $clone->fields()->pluck('id')->all(),
        );
    }

    public function test_template_blocks_use_document_content_types(): void
    {
        $version = $this->createTemplate();
        $section = $version->sections()->where('clave', 'objetivos')->firstOrFail();

        $this->actingAsAdministrator()
            ->post(route('admin.templates.fields.store', $version), [
                'section_id' => $section->id,
                'key' => 'estrategias_aprendizaje',
                'label' => 'Estrategias de aprendizaje',
                'content_type' => 'bulleted_list',
                'teacher_editable' => true,
            ])
            ->assertRedirect();

        $block = $version->fresh()->sections()->whereKey($section->id)->firstOrFail()
            ->blocks()->where('titulo', 'Estrategias de aprendizaje')->firstOrFail();
        $this->assertSame('repeatable', $block->tipo);
        $this->assertSame('bulleted_list', $block->configuracion['content_type']);
        $this->assertSame('repeatable', $block->fields()->firstOrFail()->tipo);
    }

    public function test_administrator_reorders_and_removes_draft_blocks(): void
    {
        $version = $this->createTemplate();
        $section = $version->sections()->where('clave', 'objetivos')->firstOrFail();
        $first = $section->blocks()->firstOrFail();

        $this->actingAsAdministrator()
            ->post(route('admin.templates.fields.store', $version), [
                'section_id' => $section->id,
                'key' => 'objetivos_especificos',
                'label' => 'Objetivos específicos',
                'content_type' => 'numbered_list',
            ])
            ->assertRedirect();

        $second = $section->blocks()->where('titulo', 'Objetivos específicos')->firstOrFail();

        $this->actingAsAdministrator()
            ->patch(route('admin.templates.blocks.reorder', $version), [
                'section_id' => $section->id,
                'block_ids' => [$second->id, $first->id],
            ])
            ->assertRedirect();

        $this->assertSame(1, $second->fresh()->posicion);
        $this->assertSame(2, $first->fresh()->posicion);

        $this->actingAsAdministrator()
            ->delete(route('admin.templates.blocks.destroy', ['version' => $version, 'block' => $second]))
            ->assertRedirect();

        $this->assertDatabaseMissing('bloques_plantilla', ['id' => $second->id]);
        $this->assertDatabaseMissing('definiciones_campo', ['bloque_plantilla_id' => $second->id]);
    }

    public function test_administrator_manages_template_blocks_separately_from_their_fields(): void
    {
        $version = $this->createTemplate();
        $first = $version->sections()->firstOrFail();

        $this->actingAsAdministrator()
            ->post(route('admin.templates.sections.store', $version), [
                'title' => 'Recursos y materiales',
                'key' => 'recursos_materiales',
                'first_field_label' => 'Recursos principales',
                'first_field_key' => 'recursos_principales',
                'first_field_content_type' => 'table',
            ])
            ->assertRedirect();

        $created = $version->fresh()->sections()
            ->where('titulo', 'Recursos y materiales')
            ->firstOrFail();
        $this->assertSame('Recursos principales', $created->blocks()->firstOrFail()->fields()->firstOrFail()->etiqueta);

        $sectionIds = $version->fresh()->sections()->pluck('id')->all();
        $orderedIds = [$created->id, ...array_values(array_filter($sectionIds, fn (string $id): bool => $id !== $created->id))];

        $this->actingAsAdministrator()
            ->patch(route('admin.templates.sections.reorder', $version), ['section_ids' => $orderedIds])
            ->assertRedirect();

        $this->assertSame(1, $created->fresh()->posicion);
        $this->assertSame(2, $first->fresh()->posicion);

        $this->actingAsAdministrator()
            ->delete(route('admin.templates.sections.destroy', ['version' => $version, 'section' => $created]))
            ->assertRedirect();

        $this->assertDatabaseMissing('secciones_plantilla', ['id' => $created->id]);
        $this->assertDatabaseMissing('bloques_plantilla', ['seccion_plantilla_id' => $created->id]);
    }

    public function test_coordinator_creates_and_activates_scoped_source_with_immutable_fragment(): void
    {
        $version = $this->createSourceAsCoordinator('Perfil de egreso');
        $this->addStructuredFragment($version, 'perfil.resultado', ['value' => 'Diseña software seguro']);

        $this->actingAsCoordinator()
            ->post(route('sources.versions.activate', $version))
            ->assertRedirect()
            ->assertSessionHas('success');

        $active = $version->fresh();
        $this->assertSame('active', $active->estado);
        $this->assertMatchesRegularExpression('/^[a-f0-9]{64}$/', $active->huella_sha256);
        $fragment = $active->fragments()->firstOrFail();

        $this->expectException(LogicException::class);
        $fragment->update(['titulo' => 'Cambio prohibido']);
    }

    public function test_exact_contradiction_is_persisted_and_requires_human_resolution(): void
    {
        $activeVersion = $this->createSourceAsCoordinator('Fuente vigente');
        $this->addStructuredFragment($activeVersion, 'creditos.sw601', ['value' => 4]);
        $this->actingAsCoordinator()->post(route('sources.versions.activate', $activeVersion));

        $candidate = $this->createSourceAsCoordinator('Fuente candidata');
        $this->addStructuredFragment($candidate, 'creditos.sw601', ['value' => 5]);
        $this->actingAsCoordinator()
            ->post(route('sources.versions.activate', $candidate))
            ->assertSessionHasErrors('version');

        $conflict = SourceConflict::query()->firstOrFail();
        $this->assertSame('pending', $conflict->estado);
        $this->assertSame('draft', $candidate->fresh()->estado);

        $this->actingAsCoordinator()
            ->post(route('sources.conflicts.resolve', $conflict), [
                'decision' => 'candidate',
                'justification' => 'La autoridad académica confirmó el valor candidato.',
            ])
            ->assertRedirect();
        $this->actingAsCoordinator()
            ->post(route('sources.versions.activate', $candidate))
            ->assertSessionHas('success');

        $this->assertSame('active', $candidate->fresh()->estado);
        $this->assertSame('resolved', $conflict->fresh()->estado);
        $this->assertDatabaseHas('eventos_auditoria', [
            'accion' => 'source.conflict_resolved',
            'recurso_id' => $conflict->id,
        ]);
    }

    public function test_coordinator_cannot_open_source_from_another_career(): void
    {
        $faculty = Faculty::query()->firstOrFail();
        $otherCareer = Career::query()->create([
            'facultad_id' => $faculty->id,
            'codigo_institucional' => 'REDES',
            'nombre' => 'Redes',
            'activo' => true,
        ]);
        $source = AcademicSource::query()->create([
            'carrera_id' => $otherCareer->id,
            'nombre' => 'Fuente fuera de alcance',
            'tipo' => 'malla',
            'autoridad' => 'Autoridad',
            'responsable' => 'Custodio',
            'activo' => true,
        ]);
        SourceVersion::query()->create([
            'fuente_academica_id' => $source->id,
            'numero_version' => 1,
            'estado' => 'draft',
        ]);

        $this->actingAsCoordinator()
            ->followingRedirects()
            ->get(route('sources.show', $source))
            ->assertForbidden();
    }

    private function createTemplate(): TemplateVersion
    {
        $this->actingAsAdministrator()->post(route('admin.templates.store'), ['name' => 'Plantilla verificable']);

        return TemplateVersion::query()->latest('created_at')->firstOrFail();
    }

    private function createSourceAsCoordinator(string $name): SourceVersion
    {
        $this->actingAsCoordinator()
            ->post(route('sources.store'), [
                'name' => $name,
                'type' => 'malla',
                'authority' => 'Consejo académico',
                'responsible' => 'Coordinación de Software',
                'valid_from' => now()->toDateString(),
            ])
            ->assertRedirect();

        $source = AcademicSource::query()->where('nombre', $name)->firstOrFail();

        return $source->versions()->where('numero_version', 1)->firstOrFail();
    }

    /** @param array<string, mixed> $value */
    private function addStructuredFragment(SourceVersion $version, string $dataKey, array $value): SourceFragment
    {
        $this->actingAsCoordinator()
            ->post(route('sources.fragments.store', $version), [
                'key' => str_replace('.', '_', $dataKey),
                'title' => 'Dato exacto '.$dataKey,
                'data_key' => $dataKey,
                'structured_value' => json_encode($value, JSON_THROW_ON_ERROR),
            ])
            ->assertRedirect();

        return $version->fragments()->latest('created_at')->firstOrFail();
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
}
