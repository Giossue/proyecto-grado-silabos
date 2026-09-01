<?php

namespace App\Modules\Configuration\Presentation\Http\Requests;

use App\Modules\Identity\Application\ActiveRole;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CreateSourceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('view-sources') === true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        $careerId = app(ActiveRole::class)->resolve($this)?->carrera_id;

        return [
            'nombre' => [
                'required',
                'string',
                'max:180',
                Rule::unique('fuentes_academicas', 'nombre')->where('carrera_id', $careerId),
            ],
            'description' => ['nullable', 'string', 'max:2000'],
            'internal_notes' => ['nullable', 'string', 'max:5000'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return ['nombre.unique' => 'Ya existe una fuente con ese nombre en la carrera.'];
    }
}
