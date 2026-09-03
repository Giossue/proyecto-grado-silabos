<?php

namespace App\Modules\Academic\Application;

use App\Modules\Academic\Domain\StudyModality;
use App\Modules\Academic\Infrastructure\Persistence\Models\Campus;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\Subject;
use Illuminate\Validation\ValidationException;

/**
 * Lo que la oferta hereda en vez de preguntar. El CES aprueba cada carrera para una
 * sede y una modalidad (RRA arts. 70-74): campus y modalidad viven en la carrera.
 * Cualquier materia puede apartarse de la modalidad base (tres materias en línea en
 * una carrera presencial); cuando eso pasa, la carrera es híbrida (art. 74A) sin que
 * nadie lo marque. El sílabo copia ambos datos de la oferta (I-35, I-36, I-37).
 */
class OfferingInheritance
{
    /**
     * Modalidad propia de una materia: vacío significa «la de la carrera».
     *
     * @param  array<string, mixed>  $data
     */
    public function subjectModality(array $data): ?StudyModality
    {
        $value = $data['modality'] ?? null;

        return is_string($value) && $value !== '' ? StudyModality::from($value) : null;
    }

    /** Modalidad con la que se abre la oferta de una materia. */
    public function modalityFor(Subject $subject): StudyModality
    {
        if ($subject->modalidad instanceof StudyModality) {
            return $subject->modalidad;
        }

        $subject->loadMissing('curriculum.career');
        $modality = $subject->curriculum->career->modalidad;
        if (! $modality instanceof StudyModality) {
            throw ValidationException::withMessages([
                'subject_id' => 'La carrera no tiene modalidad. Administración debe asignarla en Carreras antes de abrir ofertas.',
            ]);
        }

        return $modality;
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

    /** La carrera combina modalidades: alguna materia activa de la malla activa se aparta de la base. */
    public function isHybrid(Career $career): bool
    {
        if (! $career->modalidad instanceof StudyModality) {
            return false;
        }

        return Subject::query()
            ->where('activo', true)
            ->whereNotNull('modalidad')
            ->where('modalidad', '!=', $career->modalidad->value)
            ->whereHas('curriculum', fn ($query) => $query->where('carrera_id', $career->id)->where('estado', 'activa'))
            ->exists();
    }

    /** Etiqueta que ve la gente: la base, o «Híbrida» cuando hay materias apartadas. */
    public function labelFor(Career $career): ?string
    {
        if (! $career->modalidad instanceof StudyModality) {
            return null;
        }

        return $this->isHybrid($career) ? StudyModality::HYBRID_LABEL : $career->modalidad->label();
    }
}
