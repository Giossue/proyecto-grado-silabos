<?php

namespace Tests\Feature\Configuration;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\Faculty;
use App\Modules\Configuration\Application\Actions\SaveTemplateDocument;
use App\Modules\Configuration\Domain\TemplateAppearance;
use App\Modules\Configuration\Domain\TemplateTitleBlock;
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
        $this->assertCount(25, $template->fields()->get(), 'Incluye la ficha y las dos tablas de evaluación del PDF de referencia.');

        $evaluation = $template->sections()->where('clave', 'evaluacion')->firstOrFail();
        $blocks = $evaluation->blocks()->orderBy('posicion')->get();
        $this->assertSame(['Indicadores de evaluación', 'Escala de valoración', 'Recuperación y aprobación'], $blocks->pluck('titulo')->all());
        $indicators = $blocks->first()->configuracion['table'];
        $this->assertSame(['indicador', 'primer_parcial', 'ponderacion_primer_parcial', 'segundo_parcial', 'ponderacion_segundo_parcial'], array_column($indicators['columns'], 'key'));
        $this->assertFalse($indicators['totals']['enabled'], 'No se incorpora una fórmula o ponderación pendiente de validación.');
        $this->assertSame([false], array_values(array_unique(array_column($indicators['columns'], 'sum'))));
        $indicatorField = $template->fields()->where('clave', 'indicadores_evaluacion')->firstOrFail();
        $this->assertTrue($indicatorField->editable_docente);
        $this->assertFalse($indicatorField->heredado);
        $this->assertSame('repetible', $indicatorField->tipo);
        $this->assertDatabaseCount('valores_campo', 0);
        $this->assertDatabaseCount('filas_repetibles', 0);
        $this->assertEquals(
            TemplateAppearance::defaults(),
            $template->mapeo_documento['appearance'],
        );
        $this->assertEquals(
            TemplateTitleBlock::defaults(),
            $template->mapeo_documento['title_block'],
        );

        $this->actingAsAdministrator()
            ->get(route('admin.templates.show', $template))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Templates/Show')
                ->has('template.sections', 12)
                ->where('template.appearance.font_family', 'Arial')
                ->where('template.titleBlock.text', TemplateTitleBlock::DEFAULT_TEXT)
                ->where('logos.institution', fn (string $url): bool => str_contains($url, '/logos/institucion'))
                ->where('logos.faculty', fn (string $url): bool => str_contains($url, '/images/silabo/facultad.jpeg'))
                ->has('appearanceOptions.colors', count(TemplateAppearance::COLORS))
                ->where('processLock', null));

        $this->actingAsAdministrator()
            ->get(route('admin.templates.edit', $template))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Templates/Edit')
                ->has('template.sections', 12)
                ->where('template.id', $template->id)
                ->where('processLock', null));
    }

    public function test_administrator_creates_a_block_as_a_container_of_typed_fields(): void
    {
        $template = $this->createTemplate();

        $this->actingAsAdministrator()
            ->post(route('admin.templates.sections.store', $template), [
                'title' => 'Resultados y evidencias',
                'key' => 'bloque_resultados',
                'position' => 2,
                'fields' => [
                    ['key' => 'resumen_resultados', 'label' => 'Resumen', 'content_type' => 'text'],
                    ['key' => 'matriz_evidencias', 'label' => 'Matriz de evidencias', 'content_type' => 'table'],
                    ['key' => 'acciones_mejora', 'label' => 'Acciones de mejora', 'content_type' => 'numbered_list'],
                ],
            ])
            ->assertRedirect()
            ->assertSessionHasNoErrors();

        $section = $template->fresh()->sections()
            ->where('clave', 'bloque_resultados')
            ->firstOrFail();
        $blocks = $section->blocks()->with('fields')->orderBy('posicion')->get();

        $this->assertSame(2, $section->posicion);
        $this->assertSame(
            ['Resumen', 'Matriz de evidencias', 'Acciones de mejora'],
            $blocks->pluck('titulo')->all(),
        );
        $this->assertSame(
            ['text', 'table', 'numbered_list'],
            $blocks->pluck('configuracion')->map(fn (array $configuration): string => $configuration['content_type'])->all(),
        );
        $this->assertSame(['resumen_resultados', 'matriz_evidencias', 'acciones_mejora'], $blocks->pluck('clave')->all());
        $this->assertSame('texto', $blocks[1]->configuracion['table']['columns'][0]['key']);
        $this->assertTrue($blocks->every(fn ($block): bool => $block->fields->firstOrFail()->obligatorio));

        $this->actingAsAdministrator()
            ->from(route('admin.templates.show', $template))
            ->post(route('admin.templates.sections.store', $template), [
                'title' => 'Bloque inválido',
                'key' => 'bloque_invalido',
                'fields' => [
                    ['key' => 'resumen_resultados', 'label' => 'Clave repetida', 'content_type' => 'text'],
                ],
            ])
            ->assertSessionHasErrors('fields.0.key');

        $this->assertDatabaseMissing('secciones_plantilla', ['clave' => 'bloque_invalido']);
    }

    public function test_only_administrator_updates_controlled_template_appearance(): void
    {
        $template = $this->createTemplate();
        $appearance = [
            ...TemplateAppearance::defaults(),
            'font_family' => 'Georgia',
            'body_font_size' => 12,
            'title_font_size' => 18,
            'section_font_size' => 14,
            'field_font_size' => 12,
            'text_color' => '#1F4E78',
            'accent_color' => '#C00000',
            'table_header_background' => '#548235',
            'table_header_color' => '#FFFFFF',
            'margin_cm' => 2.0,
            'orientation' => 'landscape',
            'title_italic' => true,
            'section_alignment' => 'center',
            'body_alignment' => 'justify',
        ];

        $this->actingAsAdministrator()
            ->patch(route('admin.templates.appearance.update', $template), $appearance)
            ->assertRedirect()
            ->assertSessionHasNoErrors();

        $expected = [
            ...TemplateAppearance::defaults(),
            'body_font_size' => 12,
            'title_font_size' => 18,
            'section_font_size' => 14,
            'field_font_size' => 12,
            'margin_cm' => 2.0,
            'orientation' => 'landscape',
        ];
        $this->assertEquals($expected, $template->fresh()->mapeo_documento['appearance']);
        $this->assertDatabaseHas('eventos_auditoria', [
            'accion' => 'plantilla.apariencia_actualizada',
            'recurso_id' => $template->id,
        ]);

        $this->actingAsAdministrator()
            ->from(route('admin.templates.show', $template))
            ->patch(route('admin.templates.appearance.update', $template), [
                ...$appearance,
                'font_family' => 'Comic Sans MS',
                'accent_color' => 'url(https://example.com)',
            ])
            ->assertSessionHasErrors(['font_family', 'accent_color']);
        $this->assertEquals($expected, $template->fresh()->mapeo_documento['appearance']);

        $this->actingAsCoordinator()
            ->patch(route('admin.templates.appearance.update', $template), TemplateAppearance::defaults())
            ->assertForbidden();
    }

    public function test_title_is_a_single_persisted_block_always_projected_before_sections(): void
    {
        $this->assertSame(
            TemplateTitleBlock::defaults(),
            TemplateTitleBlock::fromMapping(['title_block' => 'formato anterior']),
        );
        $template = $this->createTemplate();

        $this->actingAsAdministrator()
            ->patch(route('admin.templates.title.update', $template), [
                'title' => 'PROGRAMA INSTITUCIONAL DE ASIGNATURA',
            ])
            ->assertRedirect()
            ->assertSessionHasNoErrors();

        $template->refresh();
        $this->assertSame(
            ['text' => 'PROGRAMA INSTITUCIONAL DE ASIGNATURA'],
            $template->mapeo_documento['title_block'],
        );
        $this->assertDatabaseHas('eventos_auditoria', [
            'accion' => 'plantilla.titulo_actualizado',
            'recurso_id' => $template->id,
        ]);

        $this->actingAsAdministrator()
            ->get(route('admin.templates.edit', $template))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('template.titleBlock.text', 'PROGRAMA INSTITUCIONAL DE ASIGNATURA')
                ->has('template.sections', 12));

        $this->actingAsAdministrator()
            ->patch(route('admin.templates.title.update', $template), ['title' => ''])
            ->assertSessionHasErrors('title');

        $this->actingAsCoordinator()
            ->patch(route('admin.templates.title.update', $template), [
                'title' => 'Cambio no autorizado',
            ])
            ->assertForbidden();

        $this->assertSame(
            'PROGRAMA INSTITUCIONAL DE ASIGNATURA',
            $template->fresh()->mapeo_documento['title_block']['text'],
        );
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
        $template = $this->createTemplate();

        $this->actingAsCoordinator()
            ->get(route('admin.templates.index'))
            ->assertForbidden();

        $this->actingAsCoordinator()
            ->get(route('admin.templates.edit', $template))
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
                'help' => 'Se llena sola desde la malla y la programación de asignatura.',
                'ai_enabled' => 1,
            ])
            ->assertRedirect()
            ->assertSessionHasNoErrors();
        $identification->refresh();
        $this->assertSame('Se llena sola desde la malla y la programación de asignatura.', $identification->ayuda);
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
            ->patch(route('admin.templates.blocks.table', ['template' => $version, 'block' => $block]), [
                ...$layout,
                'fingerprint' => SaveTemplateDocument::fingerprint($block->fresh()),
            ])
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
        $broken['fingerprint'] = SaveTemplateDocument::fingerprint($block->fresh());
        $this->actingAsAdministrator()
            ->from(route('admin.templates.show', $version))
            ->patch(route('admin.templates.blocks.table', ['template' => $version, 'block' => $block]), $broken)
            ->assertSessionHasErrors('groups');

        // Un campo de texto no acepta esquema de tabla.
        $textBlock = $version->sections()->where('clave', 'habilidades')->firstOrFail()->blocks()->firstOrFail();
        $this->actingAsAdministrator()
            ->from(route('admin.templates.show', $version))
            ->patch(route('admin.templates.blocks.table', ['template' => $version, 'block' => $textBlock]), [
                ...$layout,
                'fingerprint' => SaveTemplateDocument::fingerprint($textBlock),
            ])
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
        $this->assertFalse(Schema::hasColumn('fuentes_academicas', 'notas_internas'));

        $this->actingAsCoordinator()
            ->patch(route('sources.update', $source), [
                'nombre' => 'Perfil de egreso 2026',
                'description' => 'Versión socializada con docentes.',
            ])
            ->assertRedirect()
            ->assertSessionHas('success');

        $updated = $source->fresh();
        $this->assertSame('Perfil de egreso 2026', $updated->nombre);

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
