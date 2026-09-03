<?php

namespace App\Modules\Academic\Application;

use App\Modules\Academic\Infrastructure\Persistence\Models\Campus;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\Modality;
use App\Modules\Academic\Infrastructure\Persistence\Models\Subject;
use Illuminate\Validation\ValidationException;

/**
 * Lo que la oferta hereda en vez de preguntar. El CES aprueba cada carrera para una
 * sede y una modalidad (RRA arts. 70-74): campus y modalidad viven en la carrera. Si
 * la modalidad «combina por asignatura» (híbrida, art. 74A), cada materia lleva la
 * suya. El sílabo copia ambos datos de la oferta (I-35, I-36).
 */
class OfferingInheritance
{
    /** La carrera exige indicar la modalidad materia por materia. */
    public function perSubject(Career $career): bool
    {
        $career->loadMissing('modality');

        return $career->modality?->combina_por_asignatura === true;
    }

    /**
     * Modalidad que se guarda en la materia al crearla o editarla: obligatoria cuando la
     * carrera combina modalidades; se descarta cuando no, porque manda la de la carrera.
     *
     * @param  array<string, mixed>  $data
     */
    public function subjectModalityId(Career $career, array $data): ?string
    {
        if (! $this->perSubject($career)) {
            return null;
        }

        $modalityId = $data['modality_id'] ?? null;
        if (! is_string($modalityId) || $modalityId === '') {
            throw ValidationException::withMessages([
                'modality_id' => 'Esta carrera combina modalidades: indique la de la materia.',
            ]);
        }

        return $modalityId;
    }

    /** Modalidad con la que se abre la oferta de una materia. */
    public function modalityFor(Subject $subject): Modality
    {
        $subject->loadMissing(['curriculum.career.modality', 'modality']);
        $career = $subject->curriculum->career;
        $careerModality = $career->modality;

        if ($careerModality === null) {
            throw ValidationException::withMessages([
                'subject_id' => 'La carrera no tiene modalidad. Administración debe asignarla en Carreras antes de abrir ofertas.',
            ]);
        }

        if (! $careerModality->combina_por_asignatura) {
            return $careerModality;
        }

        if ($subject->modality === null) {
            throw ValidationException::withMessages([
                'subject_id' => "La carrera combina modalidades y {$subject->codigo_institucional} · {$subject->nombre} no tiene la suya. Indíquela en la malla antes de abrir la oferta.",
            ]);
        }

        return $subject->modality;
    }

    /** Campus en el que se dicta cualquier oferta de la carrera. */
    public function campusFor(Career $career): Campus
    {
        $career->loadMissing('campus');

        if ($career->campus === null) {
            throw ValidationException::withMessages([
                'subject_id' => 'La carrera no tiene campus. Administración debe asignarlo en Carreras antes de abrir ofertas.',
            ]);
        }

        return $career->campus;
    }
}
