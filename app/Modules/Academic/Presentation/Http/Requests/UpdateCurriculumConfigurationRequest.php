<?php

namespace App\Modules\Academic\Presentation\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateCurriculumConfigurationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->active === true
            && $this->user()->can('manage-career-academics') === true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return ['cycle_count' => ['required', 'integer', 'min:1', 'max:30']];
    }
}
