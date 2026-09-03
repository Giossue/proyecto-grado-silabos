<?php

namespace Tests\Feature\Syllabus;

use App\Modules\Syllabus\Application\IdentificationCard;
use Tests\TestCase;

/**
 * La ficha de identificación es el formato oficial calcado: esta prueba fija la
 * cuadrícula para que un cambio accidental se note. Si el formato cambia de verdad,
 * se actualiza aquí a propósito (docs/product/identificacion-institucional.md).
 */
class IdentificationCardTest extends TestCase
{
    public function test_build_takes_every_value_from_the_academic_context(): void
    {
        $data = IdentificationCard::build(
            [
                'career' => ['name' => 'Software', 'faculty' => 'FCAGEI'],
                'subject' => [
                    'name' => 'Inteligencia Artificial', 'code' => 'SW-P7-037', 'cycle' => 7,
                    'organization_unit' => 'Unidad Profesional', 'prerequisites' => ['SW-P6-032'], 'corequisites' => [],
                    'hours_ac' => '32', 'hours_pae' => '16', 'hours_aa' => '48', 'total_hours' => 96, 'credits' => '2',
                ],
                'offering' => ['period' => 'Marzo – Julio 2026', 'campus' => 'Matriz', 'modality' => 'Presencial'],
            ],
            ['A', 'B'],
            ['PAUL GUARANGA'],
            ['paul.guaranga@ueb.edu.ec'],
            ['discapacidad_tiene' => 'Sí', 'discapacidad_tipo' => 'Visual', 'formacion_experiencia' => 'Ingeniera en Sistemas'],
        );

        $this->assertSame('FCAGEI', $data['faculty']);
        $this->assertSame('Séptimo', $data['cycle']);
        $this->assertSame('A, B', $data['parallel']);
        $this->assertSame('SW-P6-032', $data['prerequisites']);
        $this->assertSame('Ninguno', $data['corequisites']);
        $this->assertSame('96', $data['total_hours']);
        $this->assertSame('', $data['shift']);
        $this->assertSame('si', $data['disability']);
        $this->assertSame('Ingeniera en Sistemas', $data['formation']);

        $grid = IdentificationCard::grid($data);
        $this->assertSame('X', $grid[9][2]['text'], 'Sí debe quedar marcado.');
        $this->assertSame('', $grid[11][1]['text']);
        $this->assertSame('Tipo de discapacidad: Visual', $grid[9][3]['text']);
        $this->assertStringEndsWith("\nIngeniera en Sistemas", $grid[17][0]['text']);
    }

    public function test_grid_matches_the_official_format(): void
    {
        $grid = IdentificationCard::grid(IdentificationCard::sample());

        // 18 filas; cada una completa las 9 columnas contando las combinaciones verticales.
        $this->assertCount(18, $grid);
        $occupied = [];
        foreach ($grid as $rowIndex => $cells) {
            $width = array_sum(array_map(fn (array $cell): int => $cell['span'], $cells));
            foreach ($occupied as $key => $pending) {
                [$row, $span, $rows] = $pending;
                if ($rowIndex > $row && $rowIndex < $row + $rows) {
                    $width += $span;
                }
            }
            $this->assertSame(9, $width, "La fila {$rowIndex} no completa las 9 columnas.");
            foreach ($cells as $cellIndex => $cell) {
                if ($cell['rows'] > 1) {
                    $occupied["{$rowIndex}.{$cellIndex}"] = [$rowIndex, $cell['span'], $cell['rows']];
                }
            }
        }

        $texts = array_map(fn (array $cells): array => array_column($cells, 'text'), $grid);
        $this->assertSame('FACULTAD: Ciencias Administrativas, Gestión Empresarial e Informática', $texts[0][0]);
        $this->assertSame(['ASIGNATURA', 'PERIODO ACADÉMICO', 'CICLO', 'PARALELO', 'JORNADA'], $texts[3]);
        $this->assertSame(['Lorem ipsum', 'Marzo – Julio 2026', 'Séptimo', 'A', 'Matutina'], $texts[4]);
        $this->assertSame('X', $texts[7][1], 'La unidad profesional debe quedar marcada.');
        $this->assertSame('', $texts[6][2], 'La unidad básica no debe marcarse.');
        $this->assertSame(['32', '16', '48', '96'], $texts[14]);
        $this->assertSame(['NOMBRE DEL DOCENTE', 'NOMBRE DEL DOCENTE', 'CORREO INSTITUCIONAL', 'docente@ueb.edu.ec'], $texts[16]);
        $this->assertSame('X', $texts[11][1], 'La muestra marca No.');
        $this->assertStringStartsWith('FORMACIÓN Y EXPERIENCIA ACADÉMICA – INVESTIGATIVA:', $texts[17][0]);
        $this->assertSame('blue', $grid[0][0]['style']);
    }
}
