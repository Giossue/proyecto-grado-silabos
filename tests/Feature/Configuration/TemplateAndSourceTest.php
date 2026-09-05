<?php

namespace Tests\Feature\Configuration;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\Faculty;
use App\Modules\Configuration\Infrastructure\Persistence\Models\AcademicSource;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Inertia\Testing\AssertableInertia as Assert;
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

        $template = SyllabusTemplate::query()->firstOrFail();
        $this->assertFalse(Schema::hasColumn('plantillas_silabo', 'es_institucional'));
        $this->assertCount(12, $template->sections()->get());
        $this->assertCount(24, $template->fields()->get(), 'Doce campos base más los cuatro de la ficha y los extra del formato.');

        $this->actingAsAdministrator()
            ->get(route('admin.templates.show', $template))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Templates/Show')
                ->has('template.sections', 12)
                ->where('processLock', null));
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

        $this->assertSame(1, SyllabusTemplate::query()->count());
    }

    public function test_database_rejects_a_second_template(): void
    {
        SyllabusTemplate::query()->create(['nombre' => 'Plantilla oficial', 'activo' => true]);

        $this->expectException(QueryException::class);
        SyllabusTemplate::query()->create(['nombre' => 'Plantilla duplicada', 'activo' => true]);
    }

    public function test_non_administrator_cannot_manage_templates(): void
    {
        $this->actingAsCoordinator()
            ->get(route('admin.templates.index'))
            ->assertForbidden();
    }

    public function test_template_is_edited_in_place_without_publishing(): void
    {
        // I-32: no hay versiones ni publicación. La plantilla se corrige en el sitio y
        // cada revisión enviada conserva su propia copia.
        $template = $this->createTemplate();
        $field = $template->fields()->firstOrFail();

        $this->actingAsAdministrator()
            ->patch(route('admin.templates.fields.update', [$template, $field]), [
                'block_id' => $field->bloque_plantilla_id,
                'key' => $field->clave,
                'label' => 'Etiqueta corregida',
                'content_type' => 'text',
            ])
            ->assertRedirect()
            ->assertSessionHas('success');

        $this->assertSame('Etiqueta corregida', $field->fresh()->etiqueta);
        $this->assertSame(1, SyllabusTemplate::query()->count());
    }

    /** I-33 (ajuste 2026-09-03): todo campo es obligatorio; solo se decide ayuda e IA. */
    public function test_field_properties_are_help_and_ai_only_and_every_field_stays_required(): void
    {
        $template = $this->createTemplate();
        $this->assertSame(0, $template->fields()->where('obligatorio', false)->whereNotIn('clave', ['discapacidad_tipo', 'discapacidad_adaptacion'])->count());

        $field = $template->fields()->where('clave', 'objetivo_general')->firstOrFail();
        $this->actingAsAdministrator()
            ->patch(route('admin.templates.fields.update', [$template, $field]), [
                'block_id' => $field->bloque_plantilla_id,
                'key' => $field->clave,
                'label' => $field->etiqueta,
                'content_type' => 'text',
                'help' => 'Redáctelo en infinitivo.',
                'ai_enabled' => 1,
                'required' => 0,
                'teacher_editable' => 0,
                'inherited' => 1,
                'master_source' => 'invento',
            ])
            ->assertRedirect()
            ->assertSessionHasNoErrors();
        $field->refresh();
        $this->assertSame('Redáctelo en infinitivo.', $field->ayuda);
        $this->assertTrue($field->ia_habilitada);
        $this->assertTrue($field->obligatorio);
        $this->assertTrue($field->editable_docente);
        $this->assertFalse($field->heredado);
        $this->assertNull($field->origen_maestro);

        // La ficha de identificación es un bloque fijo: admite ayuda y conserva su origen.
        $identification = $template->fields()->where('clave', 'asignatura')->firstOrFail();
        $this->actingAsAdministrator()
            ->patch(route('admin.templates.fields.update', [$template, $identification]), [
                'block_id' => $identification->bloque_plantilla_id,
                'key' => $identification->clave,
                'label' => $identification->etiqueta,
                'content_type' => 'institutional',
                'help' => 'Se llena sola desde la malla y la oferta.',
                'ai_enabled' => 1,
            ])
            ->assertRedirect()
            ->assertSessionHasNoErrors();
        $identification->refresh();
        $this->assertSame('Se llena sola desde la malla y la oferta.', $identification->ayuda);
        $this->assertTrue($identification->heredado);
        $this->assertSame('asignaturas', $identification->origen_maestro);
        $this->assertFalse($identification->ia_habilitada);
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
            ->delete(route('admin.templates.blocks.destroy', ['template' => $version, 'block' => $second]))
            ->assertRedirect();

        $this->assertDatabaseMissing('bloques_plantilla', ['id' => $second->id]);
        $this->assertDatabaseMissing('definiciones_campo', ['bloque_plantilla_id' => $second->id]);
    }

    public function test_administrator_designs_a_complex_table_on_a_block(): void
    {
        $version = $this->createTemplate();
        // La descripción nace como texto: al pasar a tabla expone la tabla mínima.
        $section = $version->sections()->where('clave', 'descripcion')->firstOrFail();
        $block = $section->blocks()->firstOrFail();
        $field = $block->fields()->firstOrFail();
        $sectionIndex = $section->posicion - 1;

        $this->actingAsAdministrator()
            ->patch(route('admin.templates.fields.update', ['template' => $version, 'field' => $field]), [
                'block_id' => $block->id,
                'key' => $field->clave,
                'label' => $field->etiqueta,
                'content_type' => 'table',
            ])
            ->assertRedirect();
        $this->actingAsAdministrator()
            ->get(route('admin.templates.show', $version))
            ->assertInertia(fn (Assert $page) => $page
                ->where("template.sections.$sectionIndex.blocks.0.table.columns.0.key", 'texto'));

        $layout = [
            'columns' => [
                ['key' => 'contenidos', 'label' => 'Contenidos temáticos', 'type' => 'text'],
                ['key' => 'acd', 'label' => 'ACD', 'type' => 'number', 'group' => 'docencia', 'band' => 'horas'],
                ['key' => 'ape', 'label' => 'APE', 'type' => 'number', 'group' => 'estudiante', 'band' => 'horas'],
                ['key' => 'aa', 'label' => 'AA', 'type' => 'number', 'group' => 'estudiante', 'band' => 'horas'],
            ],
            'groups' => [['key' => 'docencia', 'label' => 'Docencia'], ['key' => 'estudiante', 'label' => 'Estudiante']],
            'bands' => [['key' => 'horas', 'label' => 'Horas por semana']],
            'header_fields' => [['key' => 'nombre', 'label' => 'Nombre de la unidad']],
            'totals' => ['enabled' => true, 'label' => 'Total, horas'],
            'repeat' => ['enabled' => true, 'label' => 'Unidad'],
        ];
        $this->actingAsAdministrator()
            ->patch(route('admin.templates.blocks.table', ['template' => $version, 'block' => $block]), $layout)
            ->assertRedirect()
            ->assertSessionHasNoErrors();

        $saved = $block->fresh()->configuracion['table'];
        $this->assertSame('table', $block->fresh()->configuracion['content_type']);
        $this->assertSame(['contenidos', 'acd', 'ape', 'aa'], array_column($saved['columns'], 'key'));
        $this->assertTrue($saved['repeat']['enabled']);
        $this->assertDatabaseHas('eventos_auditoria', ['accion' => 'plantilla.tabla_actualizada', 'recurso_id' => $block->id]);

        // Un grupo partido por otra columna no es una cabecera posible.
        $broken = $layout;
        $broken['columns'][1]['group'] = 'estudiante';
        $broken['columns'][2]['group'] = 'docencia';
        $broken['columns'][3]['group'] = 'estudiante';
        $this->actingAsAdministrator()
            ->from(route('admin.templates.show', $version))
            ->patch(route('admin.templates.blocks.table', ['template' => $version, 'block' => $block]), $broken)
            ->assertSessionHasErrors('groups');

        // Un campo de texto no acepta esquema de tabla.
        $textBlock = $version->sections()->where('clave', 'habilidades')->firstOrFail()->blocks()->firstOrFail();
        $this->actingAsAdministrator()
            ->from(route('admin.templates.show', $version))
            ->patch(route('admin.templates.blocks.table', ['template' => $version, 'block' => $textBlock]), $layout)
            ->assertSessionHasErrors('table');
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
            ->delete(route('admin.templates.sections.destroy', ['template' => $version, 'section' => $created]))
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

    private function createTemplate(): SyllabusTemplate
    {
        $this->actingAsAdministrator()->post(route('admin.templates.store'), ['nombre' => 'Plantilla verificable']);

        return SyllabusTemplate::query()->firstOrFail();
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
