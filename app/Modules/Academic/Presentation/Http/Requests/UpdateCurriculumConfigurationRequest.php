<?php

namespace App\Modules\Academic\Presentation\Http\Requests;

use App\Modules\Identity\Application\ActiveRole;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCurriculumConfigurationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->activo === true
            && $this->user()->can('manage-career-academics') === true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'code' => [
                'required',
                'string',
                'max:80',
                Rule::unique('mallas', 'codigo')
                    ->where('carrera_id', app(ActiveRole::class)->resolve($this)?->carrera_id)
                    ->ignore($this->route('curriculum')),
            ],
            'cycle_count' => ['required', 'integer', 'min:1', 'max:30'],
        ];
    }
}
