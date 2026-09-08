<?php

namespace Tests\Unit\Syllabus;

use App\Modules\Configuration\Domain\TablePresets;
use App\Modules\Syllabus\Domain\PlanningTable;
use PHPUnit\Framework\TestCase;

class PlanningTableTest extends TestCase
{
    public function test_accepts_variable_units_when_weeks_and_malla_hours_match(): void
    {
        $issues = PlanningTable::issues(
            TablePresets::layout('planificacion'),
            $this->rows(4, 2, 1, 3),
            $this->context(),
        );

        $this->assertSame([], $issues);
    }

    public function test_reports_missing_weeks_component_differences_and_credit_configuration(): void
    {
        $context = $this->context();
        $context['subject']['credits'] = 3;

        $issues = PlanningTable::issues(
            TablePresets::layout('planificacion'),
            $this->rows(3, 2, 1, 3),
            $context,
        );
        $codes = array_column($issues, 'code');

        $this->assertContains('semana_faltante', $codes);
        $this->assertContains('horas_planificacion_no_coinciden', $codes);
        $this->assertContains('creditos_no_coinciden', $codes);
        $this->assertStringContainsString('faltan 2', implode(' ', array_column($issues, 'message')));
    }

    /** @return list<array<string, mixed>> */
    private function rows(int $weeks, int $acd, int $ape, int $aa): array
    {
        $rows = [
            ['data' => ['_unit' => 1, '_kind' => 'unit', 'nombre' => 'Unidad inicial', 'resultados' => 'Resultado inicial']],
        ];
        for ($week = 1; $week <= $weeks; $week++) {
            $rows[] = ['data' => [
                '_unit' => $week <= 2 ? 1 : 2,
                'semana' => $week,
                'acd' => $acd,
                'ape' => $ape,
                'aa' => $aa,
            ]];
            if ($week === 2 && $weeks > 2) {
                $rows[] = ['data' => ['_unit' => 2, '_kind' => 'unit', 'nombre' => 'Unidad final', 'resultados' => 'Resultado final']];
            }
        }

        return $rows;
    }

    /** @return array<string, mixed> */
    private function context(): array
    {
        return [
            'offering' => ['teaching_weeks' => 4],
            'subject' => [
                'hours_ac' => 8,
                'hours_pae' => 4,
                'hours_aa' => 12,
                'total_hours' => 24,
                'credits' => 0.5,
            ],
        ];
    }
}
