<?php

namespace App\Modules\Configuration\Presentation\Http\Requests;

use App\Modules\Configuration\Infrastructure\Persistence\Models\AcademicSource;
use Illuminate\Validation\Rule;

class UpdateSourceRequest extends ManageAcademicSourceRequest
{
    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        $source = $this->route('source');
        $sourceId = $source instanceof AcademicSource ? $source->id : null;
        $careerId = $source instanceof AcademicSource ? $source->carrera_id : null;

        return [
            'name' => [
                'required',
                'string',
                'max:180',
                Rule::unique('fuentes_academicas', 'nombre')
                    ->where('carrera_id', $careerId)
                    ->ignore($sourceId),
            ],
            'description' => ['nullable', 'string', 'max:2000'],
            'internal_notes' => ['nullable', 'string', 'max:5000'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return ['name.unique' => 'Ya existe una fuente con ese nombre en la carrera.'];
    }
}
