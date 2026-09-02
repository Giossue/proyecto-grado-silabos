<?php

namespace Tests\Support;

use App\Models\User;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusProcess;
use Carbon\CarbonInterface;

/**
 * Desde I-31 toda convocatoria cuelga de un proceso institucional abierto. Como solo
 * puede haber uno en curso, el ayudante reutiliza el existente y le ajusta plantilla y
 * fechas en lugar de crear otro.
 */
trait CreatesSyllabusProcess
{
    protected function openSyllabusProcess(
        string $templateId,
        CarbonInterface|string|null $startsAt = null,
        CarbonInterface|string|null $dueAt = null,
    ): SyllabusProcess {
        $attributes = [
            'plantilla_id' => $templateId,
            'inicia_en' => $startsAt ?? now()->subDay(),
            'entrega_en' => $dueAt ?? now()->addMonth(),
        ];
        $existing = SyllabusProcess::query()->inProgress()->first();

        if ($existing !== null) {
            $existing->update([...$attributes, 'estado' => SyllabusProcess::STATE_OPEN, 'pausado_en' => null]);

            return $existing->fresh();
        }

        $administrator = User::query()->where('correo_electronico', 'admin@silabos.test')->firstOrFail();

        return SyllabusProcess::query()->create([
            ...$attributes,
            'nombre' => 'Proceso institucional de prueba',
            'estado' => SyllabusProcess::STATE_OPEN,
            'creado_por' => $administrator->id,
            'abierto_por' => $administrator->id,
            'abierto_en' => now(),
        ]);
    }
}
