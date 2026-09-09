<?php

namespace App\Modules\Syllabus\Application;

use App\Modules\Academic\Infrastructure\Persistence\Models\ScheduledSubject;
use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\FieldValue;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use Illuminate\Support\Collection;

/**
 * Los campos heredados se copian de la malla y la programación de asignatura al crear el expediente —y al
 * reiniciarlo—: es la fotografía de la que parte el docente.
 */
class InheritMasterValues
{
    /** @param Collection<int, FieldDefinition> $fields */
    public function execute(Syllabus $syllabus, Collection $fields, ScheduledSubject $scheduledSubject): void
    {
        $scheduledSubject->loadMissing(['subject', 'campus']);

        foreach ($fields->where('heredado', true) as $field) {
            $value = match ($field->origen_maestro) {
                'asignaturas' => [
                    'codigo' => $scheduledSubject->subject->codigo_institucional,
                    'nombre' => $scheduledSubject->subject->nombre,
                    'ciclo' => $scheduledSubject->subject->ciclo,
                    'creditos' => $scheduledSubject->subject->creditos,
                    'horas_totales' => $scheduledSubject->subject->horas_totales,
                    'campus' => $scheduledSubject->campus->nombre,
                    'modalidad' => $scheduledSubject->modalidad->label(),
                ],
                'flujo' => ['estado' => 'Sin iniciar'],
                default => null,
            };
            FieldValue::query()->create([
                'silabo_id' => $syllabus->id,
                'definicion_campo_id' => $field->id,
                'valor' => $value,
                'heredado' => true,
                'origen' => $field->origen_maestro,
            ]);
        }
    }
}
