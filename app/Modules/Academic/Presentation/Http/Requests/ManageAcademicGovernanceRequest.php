<?php

namespace App\Modules\Academic\Presentation\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ManageAcademicGovernanceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('manage-academic-governance') === true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [];
    }
}
