<?php

namespace Tests\Feature\Configuration;

use App\Models\User;
use App\Modules\Configuration\Application\Actions\SaveTemplateDocument;
use App\Modules\Configuration\Application\TemplateDocumentDefaults;
use App\Modules\Configuration\Application\TemplateDocumentResolver;
use App\Modules\Configuration\Application\TemplateVariables;
use App\Modules\Configuration\Domain\TemplateAppearance;
use App\Modules\Configuration\Domain\TemplateDocument;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
use App\Modules\Documents\Domain\Contracts\DocumentRenderer;
use App\Modules\Documents\Domain\Data\DocumentRenderInput;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;
use ZipArchive;

class TemplateDocumentTest extends TestCase
{
    use RefreshDatabase;

    public function test_institutional_design_preserves_complex_grid_and_uses_descriptive_variables(): void
    {
        $doc = TemplateDocument::normalize(TemplateDocumentDefaults::identification(), array_keys(TemplateVariables::definitions()));
        $this->assertCount(18, TemplateDocument::nodes($doc, 'tableRow'));
        $keys = array_column(array_column(TemplateDocument::nodes($doc, 'variable'), 'attrs'), 'id');
        $this->assertContains('nombre_carrera', $keys);
        $this->assertContains('nombre_facultad', $keys);
        $this->assertNotContains('carrera', $keys);
        $this->assertCount(5, TemplateDocument::nodes($doc, 'field'));
        $values = TemplateVariables::resolve(['identification' => ['career' => 'Carrera real del expediente']]);
        $this->assertSame('Carrera real del expediente', $values['nombre_carrera']);
    }

    public function test_admin_saves_layout_and_creates_only_teacher_editable_fields_with_conflict_control(): void
    {
        $template = $this->template();
        $block = $template->fields()->where('clave', 'objetivo_general')->firstOrFail()->block;
        $doc = $this->document();
        $fingerprint = SaveTemplateDocument::fingerprint($block);
        $url = route('admin.templates.blocks.document', [$template, $block]);
        $this->patch($url, [
            'document' => $doc,
            'fingerprint' => $fingerprint,
            'heredado' => true,
            'properties' => [[
                'key' => 'respuesta_extra',
                'label' => 'Cantidad configurada',
                'help' => 'Indique una cantidad.',
                'ai_enabled' => true,
            ]],
        ])
            ->assertRedirect()->assertSessionHasNoErrors();
        $new = $block->fields()->where('clave', 'respuesta_extra')->firstOrFail();
        $this->assertTrue($new->editable_docente);
        $this->assertFalse($new->heredado);
        $this->assertTrue($new->obligatorio);
        $this->assertSame('numero', $new->tipo);
        $this->assertSame('Cantidad configurada', $new->etiqueta);
        $this->assertSame('Indique una cantidad.', $new->ayuda);
        $this->assertTrue($new->ia_habilitada);
        $this->patch(route('admin.templates.fields.update', [$template, $new]), [
            'block_id' => $block->id, 'key' => $new->clave, 'label' => $new->etiqueta,
            'content_type' => 'text', 'help' => 'Indique una cantidad.', 'ai_enabled' => false,
        ])->assertSessionHasNoErrors();
        $this->assertSame('numero', $new->fresh()->tipo);
        $saved = $block->fresh()->configuracion['document'];
        $this->patch($url, ['document' => $doc, 'fingerprint' => $fingerprint])
            ->assertSessionHasErrors('fingerprint');
        $this->assertSame($saved, $block->fresh()->configuracion['document']);
        $this->assertDatabaseHas('eventos_auditoria', ['accion' => 'plantilla.diseno_actualizado', 'recurso_id' => $block->id]);
    }

    public function test_teacher_and_coordinator_cannot_change_the_design(): void
    {
        $template = $this->template();
        $block = $template->fields()->firstOrFail()->block;
        foreach (['docente@silabos.test', 'coordinador@silabos.test'] as $email) {
            $user = User::query()->where('correo_electronico', $email)->firstOrFail();
            $this->actingAs($user)->withSession(['active_role_assignment_id' => $user->roleAssignments()->firstOrFail()->id])
                ->patch(route('admin.templates.blocks.document', [$template, $block]), ['document' => $this->document(), 'fingerprint' => SaveTemplateDocument::fingerprint($block)])
                ->assertForbidden();
        }
        $this->assertArrayNotHasKey('document', $block->fresh()->configuracion);
    }

    public function test_rejects_unknown_variables_foreign_fields_and_hostile_content_without_writes(): void
    {
        $template = $this->template();
        $block = $template->fields()->where('clave', 'objetivo_general')->firstOrFail()->block;
        $url = route('admin.templates.blocks.document', [$template, $block]);
        foreach ([
            ['type' => 'paragraph', 'content' => [['type' => 'variable', 'attrs' => ['id' => 'secreto_inexistente']]]],
            ['type' => 'paragraph', 'content' => [['type' => 'field', 'attrs' => ['key' => 'descripcion', 'label' => 'Ajeno', 'kind' => 'texto_largo']]]],
            ['type' => 'script', 'text' => 'alert(1)'],
            ['type' => 'paragraph', 'content' => [['type' => 'column', 'attrs' => ['key' => 'fuera_de_tabla', 'label' => 'Inválido', 'kind' => 'texto_largo']]]],
            ['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Texto', 'marks' => [['type' => 'textStyle', 'attrs' => ['color' => 'url(https://example.com)']]]]]],
        ] as $node) {
            $this->patch($url, ['document' => ['type' => 'doc', 'content' => [$node]], 'fingerprint' => SaveTemplateDocument::fingerprint($block)])
                ->assertSessionHasErrors('document');
            $this->assertArrayNotHasKey('document', $block->fresh()->configuracion);
        }
    }

    public function test_rejects_non_rectangular_or_cross_boundary_merges(): void
    {
        $doc = $this->document();
        $doc['content'][0]['content'][0]['content'][1]['attrs']['rowspan'] = 3;
        $this->expectException(ValidationException::class);
        TemplateDocument::normalize($doc, array_keys(TemplateVariables::definitions()));
    }

    public function test_complete_vertical_merge_and_dynamic_bullets_remain_valid(): void
    {
        $doc = ['type' => 'doc', 'content' => [['type' => 'table', 'content' => [
            ['type' => 'tableRow', 'content' => [['type' => 'tableCell', 'attrs' => ['colspan' => 2, 'rowspan' => 2], 'content' => [['type' => 'paragraph']]]]],
            ['type' => 'tableRow'],
        ]]]];
        $this->assertCount(2, TemplateDocument::nodes(TemplateDocument::normalize($doc, []), 'tableRow'));
        $list = ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [[
            'type' => 'field', 'attrs' => ['key' => 'items', 'label' => 'Elementos', 'kind' => 'repetible', 'listStyle' => 'number'],
        ]]]]];
        $resolved = TemplateDocumentResolver::resolve(TemplateDocument::normalize($list, []), [[
            'key' => 'items', 'rows' => [['data' => ['texto' => 'Primero']], ['data' => ['texto' => 'Segundo']]],
        ]], [], null);
        $this->assertSame('orderedList', $resolved['content'][0]['type']);
        $this->assertCount(2, TemplateDocument::nodes($resolved, 'listItem'));
    }

    public function test_cell_style_accepts_only_the_editor_catalog(): void
    {
        $document = $this->document();
        $cell = TemplateDocument::normalize(
            $document,
            array_keys(TemplateVariables::definitions()),
        )['content'][0]['content'][0]['content'][1];

        $this->assertSame('#E7E6E6', $cell['attrs']['backgroundColor']);
        $this->assertSame('#FFFFFF', $cell['attrs']['textColor']);
        $this->assertSame('center', $cell['attrs']['textAlign']);
        $this->assertTrue($cell['attrs']['bold']);
        $this->assertFalse($cell['attrs']['italic']);
        $this->assertSame('thick', $cell['attrs']['borderStyle']);

        foreach ([
            'backgroundColor' => 'url(https://example.com)',
            'textColor' => 'red',
            'textAlign' => 'diagonal',
            'bold' => 'yes',
            'italic' => 1,
            'borderStyle' => 'javascript',
        ] as $attribute => $invalid) {
            $hostile = $document;
            $hostile['content'][0]['content'][0]['content'][1]['attrs'][$attribute] = $invalid;

            try {
                TemplateDocument::normalize(
                    $hostile,
                    array_keys(TemplateVariables::definitions()),
                );
                $this->fail("El atributo $attribute debía rechazarse.");
            } catch (ValidationException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function test_text_field_list_format_preserves_values_and_exports_lines_as_items(): void
    {
        $template = $this->template();
        $field = $template->fields()->where('clave', 'objetivo_general')->firstOrFail();
        $block = $field->block;
        $doc = ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [[
            'type' => 'field', 'attrs' => ['key' => $field->clave, 'label' => 'Resultados esperados', 'kind' => $field->tipo, 'listStyle' => 'bullet'],
        ]]]]];
        $this->patch(route('admin.templates.blocks.document', [$template, $block]), ['document' => $doc, 'fingerprint' => SaveTemplateDocument::fingerprint($block)])
            ->assertSessionHasNoErrors();
        $this->assertSame('Resultados esperados', $field->fresh()->etiqueta);
        $this->assertSame($field->tipo, $field->fresh()->tipo);
        foreach (['bullet' => 'bulletList', 'number' => 'orderedList'] as $style => $type) {
            $doc['content'][0]['content'][0]['attrs']['listStyle'] = $style;
            $resolved = TemplateDocumentResolver::resolve($doc, [['key' => $field->clave, 'value' => "Primero\r\n\nSegundo", 'rows' => []]], [], null);
            $this->assertSame($type, $resolved['content'][0]['type']);
            $this->assertSame(['Primero', 'Segundo'], array_column(TemplateDocument::nodes($resolved, 'text'), 'text'));
        }
    }

    public function test_removing_and_restoring_a_field_preserves_its_definition_without_hidden_requirements(): void
    {
        $template = $this->template();
        $field = $template->fields()->where('clave', 'objetivo_general')->firstOrFail();
        $block = $field->block;
        $url = route('admin.templates.blocks.document', [$template, $block]);
        $this->patch($url, ['title' => 'Objetivo institucional', 'document' => ['type' => 'doc', 'content' => [['type' => 'paragraph']]], 'fingerprint' => SaveTemplateDocument::fingerprint($block)])
            ->assertSessionHasNoErrors();
        $this->assertFalse($field->fresh()->obligatorio);
        $this->assertFalse($field->fresh()->editable_docente);
        $this->assertSame('Objetivo institucional', $block->fresh()->titulo);
        $this->patch($url, ['document' => $this->document(), 'fingerprint' => SaveTemplateDocument::fingerprint($block->fresh())])
            ->assertSessionHasNoErrors();
        $this->assertTrue($field->fresh()->obligatorio);
        $this->assertTrue($field->fresh()->editable_docente);
        $this->assertArrayNotHasKey($field->clave, $block->fresh()->configuracion['detached_fields']);
    }

    public function test_word_and_text_pdf_render_saved_design_and_frozen_values(): void
    {
        $doc = TemplateDocument::normalize($this->document(), array_keys(TemplateVariables::definitions()));
        $fields = [
            ['key' => 'objetivo_general', 'value' => 'Contenido <docente> & aprobado', 'rows' => []],
            ['key' => 'respuesta_extra', 'value' => 23, 'rows' => []],
        ];
        $variables = ['nombre_carrera' => 'Carrera congelada'];
        $resolved = TemplateDocumentResolver::resolve($doc, $fields, $variables, null);
        $this->assertStringContainsString('Carrera congelada', json_encode($resolved));
        $input = new DocumentRenderInput(
            subject: 'Materia', subjectCode: 'SW-001', academicPeriod: '2026', revisionNumber: 1,
            revisionFingerprint: str_repeat('a', 64), templateId: '01900000-0000-7000-8000-000000000001',
            generatedAt: '2026-09-06T00:00:00Z', locale: 'es-EC',
            snapshot: [
                'document_mapping' => ['appearance' => [
                    ...TemplateAppearance::defaults(),
                    'table_header_background' => '#548235',
                    'body_alignment' => 'justify',
                ]],
                'template_variables' => $variables,
                'sections' => [['title' => 'Sección', 'blocks' => [['title' => 'Contenido', 'document' => $doc, 'fields' => $fields]]]],
            ],
        );
        $renderer = app(DocumentRenderer::class);
        $bundle = $renderer->render($input);
        $this->assertSame($bundle->docx->fingerprint(), $renderer->render($input)->docx->fingerprint());
        $path = tempnam(sys_get_temp_dir(), 'template-document-test-');
        file_put_contents($path, $bundle->docx->bytes);
        try {
            $zip = new ZipArchive;
            $this->assertTrue($zip->open($path));
            $xml = $zip->getFromName('word/document.xml');
            $zip->close();
            foreach (['Carrera congelada', 'Contenido &lt;docente&gt; &amp; aprobado', 'w:gridSpan w:val="2"', 'w:vMerge w:val="restart"', 'w:vMerge w:val="continue"', 'w:fill="E7E6E6"', 'w:color w:val="FFFFFF"', 'w:color w:val="CC0000"', 'w:sz w:val="28"', 'w:jc w:val="center"', 'w:jc w:val="both"', 'Times New Roman', '<w:tcBorders>', 'w:sz="12"'] as $expected) {
                $this->assertStringContainsString($expected, $xml);
            }
            $this->assertStringNotContainsString('w:fill="548235"', $xml);
        } finally {
            unlink($path);
        }
        $this->assertStringNotContainsString('@nombre_carrera', $bundle->pdf->bytes);
    }

    public function test_repeatable_design_keeps_typed_values_units_and_totals_with_vertical_merges(): void
    {
        $template = $this->template();
        $block = $template->fields()->where('clave', 'unidades')->firstOrFail()->block;
        $column = fn ($key, $kind) => ['type' => 'column', 'attrs' => ['key' => $key, 'label' => $key, 'kind' => $kind]];
        $cell = fn ($content, $span = 1, $height = 1) => ['type' => 'tableCell', 'attrs' => ['colspan' => $span, 'rowspan' => $height], 'content' => [['type' => 'paragraph', 'content' => $content]]];
        $row = fn ($role, $cells) => ['type' => 'tableRow', 'attrs' => ['rowRole' => $role], 'content' => $cells];
        $doc = ['type' => 'doc', 'content' => [['type' => 'table', 'attrs' => ['repeatKey' => 'unidades'], 'content' => [
            $row('fixed', [$cell([['type' => 'text', 'text' => 'Cabecera libre']], 2)]),
            $row('record', [$cell([$column('contenido', 'texto_largo')], 1, 2), $cell([$column('acd', 'numero')])]),
            $row('record', [$cell([$column('acd', 'numero')])]),
            $row('total', [$cell([['type' => 'text', 'text' => 'Total']]), $cell([$column('acd', 'numero')])]),
        ]]]];
        $this->patch(route('admin.templates.blocks.document', [$template, $block]), ['document' => $doc, 'fingerprint' => SaveTemplateDocument::fingerprint($block)])
            ->assertSessionHasNoErrors();
        $configuration = $block->fresh()->configuracion;
        $this->patch(route('admin.templates.blocks.table', [$template, $block]), $configuration['table'])
            ->assertSessionHasErrors('table');
        $this->assertSame($configuration, $block->fresh()->configuracion);
        $this->assertCount(2, $configuration['table']['columns']);
        $this->assertSame('number', $configuration['table']['columns'][1]['type']);
        $this->assertTrue($configuration['table']['columns'][1]['sum']);
        $fields = [['key' => 'unidades', 'rows' => [
            ['data' => ['_unit' => 1, 'contenido' => 'Tema A', 'acd' => 2]],
            ['data' => ['_unit' => 1, 'contenido' => 'Tema B', 'acd' => 3]],
            ['data' => ['_unit' => 2, 'contenido' => 'Tema C', 'acd' => 7]],
        ]]];
        $resolved = TemplateDocumentResolver::resolve($configuration['document'], $fields, [], $configuration['table']);
        $this->assertCount(2, TemplateDocument::nodes($resolved, 'table'));
        $this->assertCount(10, TemplateDocument::nodes($resolved, 'tableRow'));
        $texts = array_column(TemplateDocument::nodes($resolved, 'text'), 'text');
        foreach (['Tema A', 'Tema B', 'Tema C', '5', '7'] as $expected) {
            $this->assertContains($expected, $texts);
        }
        $doc['content'][0]['content'][0]['content'][0]['attrs']['rowspan'] = 2;
        $this->patch(route('admin.templates.blocks.document', [$template, $block]), ['document' => $doc, 'fingerprint' => SaveTemplateDocument::fingerprint($block->fresh())])
            ->assertSessionHasErrors('document');
    }

    public function test_design_properties_save_atomically_and_reject_foreign_fields_and_stale_edits(): void
    {
        $template = $this->template();
        $field = $template->fields()->where('clave', 'objetivo_general')->firstOrFail();
        $block = $field->block;
        $url = route('admin.templates.blocks.document', [$template, $block]);
        $fingerprint = SaveTemplateDocument::fingerprint($block);
        $payload = ['document' => $this->document(), 'fingerprint' => $fingerprint, 'title' => 'Nuevo título',
            'properties' => [['key' => $field->clave, 'label' => 'Objetivo actualizado', 'help' => 'Ayuda actualizada.', 'ai_enabled' => true]]];
        $this->patch($url, [...$payload, 'properties' => [...$payload['properties'], ['key' => 'descripcion', 'label' => 'Campo ajeno', 'help' => 'No debe guardarse.']]])
            ->assertSessionHasErrors('properties.1.key');
        $this->assertSame($fingerprint, SaveTemplateDocument::fingerprint($block->fresh()));
        $this->patch($url, [...$payload, 'properties' => [['key' => $field->clave, 'label' => 'Objetivo actualizado', 'help' => str_repeat('x', 2001)]]])
            ->assertSessionHasErrors('properties.0.help');
        $this->assertSame($fingerprint, SaveTemplateDocument::fingerprint($block->fresh()));
        $this->patch($url, $payload)->assertSessionHasNoErrors();
        $this->assertSame('Nuevo título', $block->fresh()->titulo);
        $this->assertSame('Ayuda actualizada.', $field->fresh()->ayuda);
        $this->assertSame('Objetivo actualizado', $field->fresh()->etiqueta);
        $savedFields = TemplateDocument::nodes($block->fresh()->configuracion['document'], 'field');
        $this->assertSame('Objetivo actualizado', collect($savedFields)->firstWhere('attrs.key', $field->clave)['attrs']['label']);
        $this->assertTrue($field->fresh()->ia_habilitada);
        $this->assertSame($field->tipo, $field->fresh()->tipo);
        $this->patch($url, [...$payload, 'title' => 'Cambio obsoleto'])->assertSessionHasErrors('fingerprint');
        $this->assertSame('Nuevo título', $block->fresh()->titulo);
    }

    public function test_properties_cannot_enable_ai_on_inherited_fields_or_reactivate_removed_fields(): void
    {
        $template = $this->template();
        $field = $template->fields()->where('clave', 'objetivo_general')->firstOrFail();
        $block = $field->block;
        $url = route('admin.templates.blocks.document', [$template, $block]);
        $field->update(['heredado' => true]);
        $payload = ['document' => $this->document(), 'fingerprint' => SaveTemplateDocument::fingerprint($block->fresh()),
            'properties' => [['key' => $field->clave, 'label' => $field->etiqueta, 'help' => null, 'ai_enabled' => true]]];
        $this->patch($url, $payload)->assertSessionHasErrors('properties.0.ai_enabled');
        $field->update(['heredado' => false]);
        $payload['fingerprint'] = SaveTemplateDocument::fingerprint($block->fresh());
        $payload['document'] = ['type' => 'doc', 'content' => [['type' => 'paragraph']]];
        $this->patch($url, $payload)->assertSessionHasNoErrors();
        $this->assertFalse($field->fresh()->ia_habilitada);
        $this->assertFalse($field->fresh()->editable_docente);
        $this->assertTrue($block->fresh()->configuracion['detached_fields'][$field->clave]['ia_habilitada']);
    }

    public function test_flow_accepts_only_properties_and_never_a_document(): void
    {
        $template = $this->template();
        $block = $template->sections()->with('blocks')->get()->flatMap->blocks->first(fn ($block) => $block->configuredContentType() === 'flow');
        $this->assertNotNull($block);
        $field = $block->fields()->firstOrFail();
        $url = route('admin.templates.blocks.document', [$template, $block]);
        $payload = ['document' => null, 'fingerprint' => SaveTemplateDocument::fingerprint($block),
            'properties' => [['key' => $field->clave, 'label' => $field->etiqueta, 'help' => 'Estado determinado por el sistema.']]];
        $this->patch($url, [...$payload, 'document' => $this->document()])->assertSessionHasErrors('document');
        $this->patch($url, $payload)->assertSessionHasNoErrors();
        $this->assertSame('Estado determinado por el sistema.', $field->fresh()->ayuda);
        $this->assertArrayNotHasKey('document', $block->fresh()->configuracion);
    }

    private function template(): SyllabusTemplate
    {
        $this->seed(DatabaseSeeder::class);
        $user = User::query()->where('correo_electronico', 'admin@silabos.test')->firstOrFail();
        $this->actingAs($user)->withSession(['active_role_assignment_id' => $user->roleAssignments()->firstOrFail()->id]);
        $this->post(route('admin.templates.store'))->assertRedirect();

        return SyllabusTemplate::query()->firstOrFail();
    }

    /** @return array<string, mixed> */
    private function document(): array
    {
        $p = fn ($content) => ['type' => 'paragraph', 'attrs' => ['textAlign' => 'right'], 'content' => $content];
        $cell = fn ($content, $span = 1, $height = 1) => ['type' => 'tableCell', 'attrs' => ['colspan' => $span, 'rowspan' => $height, 'backgroundColor' => '#DBE5F1'], 'content' => [$p($content)]];
        $field = fn ($key, $label, $kind) => ['type' => 'field', 'attrs' => ['key' => $key, 'label' => $label, 'kind' => $kind]];

        $document = ['type' => 'doc', 'content' => [['type' => 'table', 'content' => [
            ['type' => 'tableRow', 'attrs' => ['rowRole' => 'fixed'], 'content' => [
                $cell([['type' => 'variable', 'attrs' => ['id' => 'nombre_carrera'], 'marks' => [['type' => 'bold'], ['type' => 'italic'], ['type' => 'underline'], ['type' => 'textStyle', 'attrs' => ['fontFamily' => 'Times New Roman', 'fontSize' => '14pt', 'color' => '#CC0000']]]]], 2),
                $cell([$field('objetivo_general', 'Objetivo general', 'markdown')], 1, 2),
            ]],
            ['type' => 'tableRow', 'content' => [
                $cell([['type' => 'text', 'text' => 'Texto fijo']]),
                $cell([$field('respuesta_extra', 'Cantidad', 'numero')]),
            ]],
        ]]]];
        $styled = &$document['content'][0]['content'][0]['content'][1]['attrs'];
        $styled = [
            ...$styled,
            'backgroundColor' => '#E7E6E6',
            'textColor' => '#FFFFFF',
            'textAlign' => 'center',
            'bold' => true,
            'italic' => false,
            'borderStyle' => 'thick',
        ];

        return $document;
    }
}
