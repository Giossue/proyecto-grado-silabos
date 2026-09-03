<?php

namespace App\Modules\Syllabus\Application;

use App\Modules\Academic\Infrastructure\Persistence\Models\CourseOffering;
use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\FieldValue;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use Illuminate\Support\Collection;

/**
 * Los campos heredados se copian de la malla y la oferta al crear el expediente —y al
 * reiniciarlo—: es la fotografía de la que parte el docente.
 */
class InheritMasterValues
{
    /** @param Collection<int, FieldDefinition> $fields */
    public function execute(Syllabus $syllabus, Collection $fields, CourseOffering $offering): void
    {
        $offering->loadMissing(['subject', 'campus']);

        foreach ($fields->where('heredado', true) as $field) {
            $value = match ($field->origen_maestro) {
                'asignaturas' => [
                    'codigo' => $offering->subject->codigo_institucional,
                    'nombre' => $offering->subject->nombre,
                    'ciclo' => $offering->subject->ciclo,
                    'creditos' => $offering->subject->creditos,
                    'horas_totales' => $offering->subject->horas_totales,
                    'campus' => $offering->campus->nombre,
                    'modalidad' => $offering->modalidad->label(),
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
