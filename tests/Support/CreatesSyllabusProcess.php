<?php

namespace Tests\Support;

use App\Modules\Academic\Infrastructure\Persistence\Models\AcademicPeriod;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusProcess;
use Carbon\CarbonInterface;

/**
 * Desde I-31 toda convocatoria cuelga de un proceso institucional abierto. Como solo
 * puede haber uno en curso, el ayudante reutiliza el existente y le ajusta plantilla y
 * fechas en lugar de crear otro.
 */
trait CreatesSyllabusProcess
{
    /** Planificación válida para la materia sintética del seeder: 64/32/96 en 16 semanas. */
    protected function validPlanningRowsPayload(): array
    {
        $rows = [['data' => [
            '_unit' => 1,
            '_kind' => 'unit',
            'nombre' => 'Unidad integrada',
            'resultados' => 'Resultado de aprendizaje verificable',
        ]]];
        for ($week = 1; $week <= 16; $week++) {
            $rows[] = ['data' => [
                '_unit' => 1,
                'semana' => $week,
                'acd' => 4,
                'ape' => 2,
                'aa' => 6,
                'contenidos' => "Contenido de la semana {$week}",
            ]];
        }

        return $rows;
    }

    protected function openSyllabusProcess(
        string $templateId,
        CarbonInterface|string|null $startsAt = null,
        CarbonInterface|string|null $dueAt = null,
    ): SyllabusProcess {
        $attributes = [
            'plantilla_id' => $templateId,
            'periodo_academico_id' => AcademicPeriod::query()->where('activo', true)->valueOrFail('id'),
            'inicia_en' => $startsAt ?? now()->subDay(),
            'entrega_en' => $dueAt ?? now()->addMonth(),
        ];
        $existing = SyllabusProcess::query()->inProgress()->first();

        if ($existing !== null) {
            $existing->update([...$attributes, 'estado' => SyllabusProcess::STATE_OPEN]);

            return $existing->fresh();
        }

        return SyllabusProcess::query()->create([
            ...$attributes,
            'estado' => SyllabusProcess::STATE_OPEN,
        ]);
    }
}
