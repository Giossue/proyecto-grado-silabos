<?php

namespace App\Modules\Academic\Presentation\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ManageCareerAcademicStructureRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('manage-career-academics') === true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [];
    }
}
