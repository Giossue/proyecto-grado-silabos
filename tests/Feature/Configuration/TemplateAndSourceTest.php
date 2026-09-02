<?php

namespace Tests\Feature\Configuration;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\Faculty;
use App\Modules\Configuration\Infrastructure\Persistence\Models\AcademicSource;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
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
        $this->administrator = User::query()->where('correo_electronico', 'admin@silabos.test')->firstOrFail();
        $this->administratorContext = $this->administrator->roleAssignments()->firstOrFail();
        $this->coordinator = User::query()->where('correo_electronico', 'coordinador@silabos.test')->firstOrFail();
        $this->coordinatorContext = $this->coordinator->roleAssignments()->firstOrFail();
    }

    public function test_administrator_creates_baseline_template_with_twelve_areas(): void
    {
        $this->actingAsAdministrator()
            ->post(route('admin.templates.store'), [
                'nombre' => 'Plantilla Software',
                'description' => 'Prototipo estructurado para validación.',
            ])
            ->assertRedirect();

        $version = TemplateVersion::query()->firstOrFail();
        $this->assertSame('borrador', $version->estado);
        $this->assertTrue((bool) $version->template->es_institucional);
        $this->assertCount(12, $version->sections()->get());
        $this->assertCount(12, $version->fields()->get());

        $this->actingAsAdministrator()
            ->get(route('admin.templates.show', $version))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Templates/Show')
                ->has('templateVersion.sections', 12)
                ->where('templateVersion.state', 'borrador'));
    }

    public function test_administrator_can_only_create_one_institutional_template(): void
    {
        $this->actingAsAdministrator()
            ->post(route('admin.templates.store'), ['nombre' => 'Plantilla institucional'])
            ->assertRedirect();

        $this->actingAsAdministrator()
            ->from(route('admin.templates.index'))
            ->post(route('admin.templates.store'), ['nombre' => 'Otra plantilla'])
            ->assertRedirect(route('admin.templates.index'))
            ->assertSessionHasErrors('template');

        $this->assertSame(1, TemplateVersion::query()
            ->whereHas('template', fn ($query) => $query->where('es_institucional', true))
            ->count());
    }

    public function test_legacy_template_is_not_available_for_new_template_operations(): void
    {
        $legacy = SyllabusTemplate::query()->create([
            'nombre' => 'Plantilla anterior',
            'activo' => true,
        ]);
        $version = TemplateVersion::query()->create([
            'plantilla_id' => $legacy->id,
            'numero_version' => 1,
            'estado' => 'borrador',
        ]);

        $this->actingAsAdministrator()
            ->get(route('admin.templates.show', $version))
            ->assertNotFound();
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
        $this->assertSame('publicada', $published->estado);
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
        $this->assertSame('borrador', $clone->estado);
        $this->assertSame(2, $clone->numero_version);
        $this->assertCount(12, $clone->fields()->get());
        $this->assertNotEqualsCanonicalizing(
            $version->fields()->pluck('id')->all(),
            $clone->fields()->pluck('id')->all(),
        );

        $this->actingAsAdministrator()
            ->get(route('admin.templates.show', $clone))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Templates/Show')
                ->has('templateVersion.template.versions', 2)
                ->where('templateVersion.template.versions.0.number', 2)
                ->where('templateVersion.template.versions.0.state', 'borrador')
                ->where('templateVersion.template.versions.1.number', 1)
                ->where('templateVersion.template.versions.1.state', 'publicada'));
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
                'position' => 1,
            ])
            ->assertRedirect();

        $block = $version->fresh()->sections()->whereKey($section->id)->firstOrFail()
            ->blocks()->where('titulo', 'Estrategias de aprendizaje')->firstOrFail();
        $this->assertSame('repetible', $block->tipo);
        $this->assertSame('bulleted_list', $block->configuracion['content_type']);
        $this->assertSame('repetible', $block->fields()->firstOrFail()->tipo);
        $this->assertSame(1, $block->posicion);
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
                'position' => 2,
            ])
            ->assertRedirect();

        $created = $version->fresh()->sections()
            ->where('titulo', 'Recursos y materiales')
            ->firstOrFail();
        $this->assertSame(2, $created->posicion);
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

    public function test_coordinator_creates_and_edits_source_document(): void
    {
        $source = $this->createSourceAsCoordinator('Perfil de egreso');
        $this->assertSame('Documento de referencia.', $source->descripcion);
        $this->assertSame('Entregar al inicio del periodo.', $source->notas_internas);

        $this->actingAsCoordinator()
            ->patch(route('sources.update', $source), [
                'nombre' => 'Perfil de egreso 2026',
                'description' => 'Versión socializada con docentes.',
                'internal_notes' => null,
            ])
            ->assertRedirect()
            ->assertSessionHas('success');

        $updated = $source->fresh();
        $this->assertSame('Perfil de egreso 2026', $updated->nombre);
        $this->assertNull($updated->notas_internas);

        $this->actingAsCoordinator()
            ->put(route('sources.content.update', $source), [
                'content' => "## Resultado\n\nDiseña software seguro.",
            ])
            ->assertRedirect()
            ->assertSessionHas('success');

        $this->assertSame("## Resultado\n\nDiseña software seguro.", $source->fresh()->contenido);
        $this->assertDatabaseHas('eventos_auditoria', [
            'accion' => 'fuente.contenido_actualizado',
            'recurso_id' => $source->id,
        ]);

        $this->actingAsCoordinator()
            ->followingRedirects()
            ->get(route('sources.show', $source))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Sources/Show')
                ->where('source.name', 'Perfil de egreso 2026')
                ->where('source.content', "## Resultado\n\nDiseña software seguro."));
    }

    public function test_source_name_is_unique_per_career(): void
    {
        $this->createSourceAsCoordinator('Reglamento académico');

        $this->actingAsCoordinator()
            ->from(route('coordination.sources.index'))
            ->post(route('sources.store'), ['nombre' => 'Reglamento académico'])
            ->assertRedirect(route('coordination.sources.index'))
            ->assertSessionHasErrors('nombre');

        $this->assertSame(1, AcademicSource::query()->where('nombre', 'Reglamento académico')->count());
    }

    public function test_administrator_cannot_access_sources(): void
    {
        $source = $this->createSourceAsCoordinator('Fuente de coordinación');

        $this->actingAsAdministrator()
            ->get(route('sources.index'))
            ->assertForbidden();

        $this->actingAsAdministrator()
            ->post(route('sources.store'), ['nombre' => 'Fuente administrativa'])
            ->assertForbidden();

        $this->actingAsAdministrator()
            ->put(route('sources.content.update', $source), ['content' => 'Edición indebida'])
            ->assertForbidden();
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
            'activo' => true,
        ]);

        $this->actingAsCoordinator()
            ->followingRedirects()
            ->get(route('sources.show', $source))
            ->assertForbidden();

        $this->actingAsCoordinator()
            ->put(route('sources.content.update', $source), ['content' => 'Edición fuera de alcance'])
            ->assertForbidden();
    }

    private function createTemplate(): TemplateVersion
    {
        $this->actingAsAdministrator()->post(route('admin.templates.store'), ['nombre' => 'Plantilla verificable']);

        return TemplateVersion::query()->latest('creado_en')->firstOrFail();
    }

    private function createSourceAsCoordinator(string $name): AcademicSource
    {
        $this->actingAsCoordinator()
            ->post(route('sources.store'), [
                'nombre' => $name,
                'description' => 'Documento de referencia.',
                'internal_notes' => 'Entregar al inicio del periodo.',
            ])
            ->assertRedirect();

        return AcademicSource::query()->where('nombre', $name)->firstOrFail();
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
