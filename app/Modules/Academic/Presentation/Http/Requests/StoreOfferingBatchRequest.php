<?php

namespace App\Modules\Academic\Presentation\Http\Requests;

use App\Modules\Academic\Domain\AcademicStructurePermissions;
use App\Modules\Academic\Infrastructure\Persistence\Models\Curriculum;
use App\Modules\Identity\Application\ActiveRole;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Varias ofertas de una vez: un periodo, un campus y las materias marcadas (I-36). */
class StoreOfferingBatchRequest extends FormRequest
{
    public function authorize(): bool
    {
        $activeRole = app(ActiveRole::class)->resolve($this);

        return $this->user()?->activo === true
            && $activeRole !== null
            && AcademicStructurePermissions::mayCreate($activeRole, 'oferta');
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        $careerId = app(ActiveRole::class)->resolve($this)?->carrera_id;

        return [
            'period_id' => [
                'required',
                'uuid',
                Rule::exists('periodos_academicos', 'id')->where(fn ($query) => $query
                    ->where('activo', true)
                    ->where(fn ($periods) => $periods
                        ->whereNull('carrera_id')
                        ->orWhere('carrera_id', $careerId))),
            ],
            'campus_id' => ['required', 'uuid', Rule::exists('campus', 'id')->where('activo', true)],
            'subject_ids' => ['required', 'array', 'min:1'],
            'subject_ids.*' => [
                'uuid',
                'distinct',
                Rule::exists('asignaturas', 'id')->where(fn ($query) => $query
                    ->where('activo', true)
                    ->whereIn('malla_id', Curriculum::query()
                        ->select('id')
                        ->where('carrera_id', $careerId)
                        ->where('estado', 'activa'))),
            ],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'subject_ids.required' => 'Marque al menos una materia.',
            'subject_ids.min' => 'Marque al menos una materia.',
            'subject_ids.*.exists' => 'Alguna materia marcada no pertenece a la malla activa.',
        ];
    }
}
