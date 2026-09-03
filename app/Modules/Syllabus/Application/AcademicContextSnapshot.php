<?php

namespace App\Modules\Syllabus\Application;

use App\Modules\Academic\Infrastructure\Persistence\Models\CourseOffering;
use App\Modules\Academic\Infrastructure\Persistence\Models\SubjectFieldValue;
use App\Modules\Academic\Infrastructure\Persistence\Models\SubjectRequirement;

class AcademicContextSnapshot
{
    /** @return array<string, mixed> */
    public function build(CourseOffering $offering): array
    {
        $offering->loadMissing([
            'subject.curriculum.career.faculty',
            'subject.requirements.requirement',
            'subject.fieldValues.definition',
            'academicPeriod',
            'campus',
            'modality',
        ]);
        $subject = $offering->subject;
        $curriculum = $subject->curriculum;
        $career = $curriculum->career;
        $requirementCodes = fn (string $type): array => $subject->requirements
            ->where('tipo', $type)
            ->map(fn (SubjectRequirement $requirement): string => $requirement->requirement->codigo_institucional)
            ->sort()
            ->values()
            ->all();

        return [
            'schema_version' => 1,
            // La ficha de identificación (I-34) sale de aquí: carrera, facultad y requisitos.
            'career' => [
                'id' => $career->id,
                'code' => $career->codigo_institucional,
                'name' => $career->nombre,
                'faculty' => $career->faculty?->nombre,
            ],
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
                'prerequisites' => $requirementCodes('prerrequisito'),
                'corequisites' => $requirementCodes('correquisito'),
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
