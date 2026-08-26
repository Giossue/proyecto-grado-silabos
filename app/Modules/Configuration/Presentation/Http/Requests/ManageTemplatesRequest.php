<?php

namespace App\Modules\Configuration\Presentation\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ManageTemplatesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('manage-templates') === true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [];
    }
}
