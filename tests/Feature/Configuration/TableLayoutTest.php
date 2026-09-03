<?php

namespace Tests\Feature\Configuration;

use App\Modules\Configuration\Domain\TableLayout;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/** I-34: el esquema de tabla se normaliza y rechaza cabeceras imposibles. */
class TableLayoutTest extends TestCase
{
    public function test_default_layout_keeps_the_historical_text_column(): void
    {
        $layout = TableLayout::default();

        $this->assertSame('texto', $layout['columns'][0]['key']);
        $this->assertFalse($layout['totals']['enabled']);
        $this->assertFalse($layout['repeat']['enabled']);
        $this->assertSame([], TableLayout::numericColumns($layout));
    }

    public function test_normalizes_grouped_columns_and_drops_unused_groups(): void
    {
        $layout = TableLayout::normalize([
            'columns' => [
                ['key' => 'contenidos', 'label' => ' Contenidos  temáticos ', 'type' => 'text'],
                ['key' => 'semana', 'label' => 'Semanas', 'type' => 'number', 'band' => 'horas'],
                ['key' => 'acd', 'label' => 'ACD', 'type' => 'number', 'group' => 'docencia', 'band' => 'horas'],
                ['key' => 'ape', 'label' => 'APE', 'type' => 'number', 'group' => 'estudiante', 'band' => 'horas'],
                ['key' => 'aa', 'label' => 'AA', 'type' => 'number', 'group' => 'estudiante', 'band' => 'horas'],
                ['key' => 'evaluacion', 'label' => 'Evaluación', 'type' => 'texto_invalido'],
            ],
            'groups' => [
                ['key' => 'docencia', 'label' => 'Docencia'],
                ['key' => 'estudiante', 'label' => 'Estudiante'],
                ['key' => 'huerfano', 'label' => 'Sin columnas'],
            ],
            'bands' => [['key' => 'horas', 'label' => 'Horas por semana']],
            'header_fields' => [['key' => 'nombre', 'label' => 'Nombre de la unidad']],
            'totals' => ['enabled' => true, 'label' => ''],
            'repeat' => ['enabled' => '1'],
        ]);

        $this->assertSame('Contenidos temáticos', $layout['columns'][0]['label']);
        $this->assertSame('text', $layout['columns'][5]['type']);
        $this->assertSame(['docencia', 'estudiante'], array_column($layout['groups'], 'key'));
        $this->assertSame(['semana', 'acd', 'ape', 'aa'], TableLayout::numericColumns($layout));
        $this->assertSame(['enabled' => true, 'label' => 'Total'], $layout['totals']);
        $this->assertSame(['enabled' => true, 'label' => 'Unidad'], $layout['repeat']);
    }

    public function test_rejects_groups_that_are_not_contiguous_or_cross_bands(): void
    {
        try {
            TableLayout::normalize([
                'columns' => [
                    ['key' => 'a', 'label' => 'A', 'type' => 'text', 'group' => 'g'],
                    ['key' => 'b', 'label' => 'B', 'type' => 'text'],
                    ['key' => 'c', 'label' => 'C', 'type' => 'text', 'group' => 'g'],
                ],
                'groups' => [['key' => 'g', 'label' => 'Grupo']],
            ]);
            $this->fail('Se esperaba un error de contigüidad.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('groups', $exception->errors());
        }

        try {
            TableLayout::normalize([
                'columns' => [
                    ['key' => 'a', 'label' => 'A', 'type' => 'text', 'group' => 'g', 'band' => 'x'],
                    ['key' => 'b', 'label' => 'B', 'type' => 'text', 'group' => 'g', 'band' => 'y'],
                ],
                'groups' => [['key' => 'g', 'label' => 'Grupo']],
                'bands' => [['key' => 'x', 'label' => 'X'], ['key' => 'y', 'label' => 'Y']],
            ]);
            $this->fail('Se esperaba un error de cruce de agrupamientos.');
        } catch (ValidationException $exception) {
            $this->assertSame('Un grupo no puede cruzar dos agrupamientos.', $exception->errors()['groups'][0]);
        }

        try {
            TableLayout::normalize(['columns' => [['key' => 'a', 'label' => 'A', 'group' => 'nope']]]);
            $this->fail('Se esperaba un error por grupo inexistente.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('columns.0.group', $exception->errors());
        }
    }
}
