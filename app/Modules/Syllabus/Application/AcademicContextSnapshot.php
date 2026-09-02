<?php

namespace App\Modules\Syllabus\Application;

use App\Modules\Academic\Infrastructure\Persistence\Models\CourseOffering;
use App\Modules\Academic\Infrastructure\Persistence\Models\SubjectFieldValue;

class AcademicContextSnapshot
{
    /** @return array<string, mixed> */
    public function build(CourseOffering $offering): array
    {
        $offering->loadMissing([
            'subject.curriculum',
            'subject.fieldValues.definition',
            'academicPeriod',
            'campus',
            'modality',
        ]);
        $subject = $offering->subject;
        $curriculum = $subject->curriculum;

        return [
            'schema_version' => 1,
            'curriculum' => [
                'id' => $curriculum->id,
                'code' => $curriculum->codigo,
                'cycle_count' => $curriculum->numero_ciclos,
            ],
            'subject' => [
                'id' => $subject->id,
                'code' => $subject->codigo_institucional,
                'name' => $subject->nombre,
                'cycle' => $subject->ciclo,
                'position' => $subject->orden_en_ciclo,
                'organization_unit' => $subject->unidad_organizacion_curricular,
                'credits' => $subject->creditos,
                'total_hours' => $subject->horas_totales,
                'hours_project' => $subject->horas_proyecto,
                'hours_ap' => $subject->horas_ap,
                'hours_ac' => $subject->horas_ac,
                'hours_pae' => $subject->horas_pae,
                'hours_aa' => $subject->horas_aa,
                'hours_paec' => $subject->horas_paec,
                'custom_fields' => $subject->fieldValues
                    ->map(fn (SubjectFieldValue $value): array => [
                        'key' => $value->definition->clave,
                        'label' => $value->definition->etiqueta,
                        'type' => $value->definition->tipo,
                        'value' => $value->valor,
                    ])->values()->all(),
            ],
            'offering' => [
                'id' => $offering->id,
                'period' => $offering->academicPeriod->nombre,
                'campus' => $offering->campus->nombre,
                'modality' => $offering->modality->nombre,
            ],
        ];
    }
}
