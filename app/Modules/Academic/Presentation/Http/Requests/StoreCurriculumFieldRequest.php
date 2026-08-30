<?php

namespace App\Modules\Academic\Presentation\Http\Requests;

use App\Modules\Academic\Domain\CurriculumSystemFields;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreCurriculumFieldRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->active === true
            && $this->user()->can('manage-career-academics') === true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'key' => [
                'required',
                'string',
                'max:80',
                'regex:/^[a-z][a-z0-9_]*$/',
                Rule::unique('definiciones_campo_malla', 'clave')
                    ->where('version_malla_id', $this->route('curriculum'))
                    ->where('activo', true),
            ],
            'label' => ['required', 'string', 'max:120'],
            'type' => ['required', Rule::in(['text', 'number', 'integer', 'boolean'])],
            'system_key' => [
                'nullable',
                Rule::in(array_keys(CurriculumSystemFields::ATTRIBUTES)),
                Rule::unique('definiciones_campo_malla', 'clave_sistema')
                    ->where('version_malla_id', $this->route('curriculum'))
                    ->where('activo', true),
            ],
            'position' => ['required', 'integer', 'min:0', 'max:999'],
            'visible_on_card' => ['required', 'boolean'],
            'totalizable' => ['required', 'boolean'],
        ];
    }
}
