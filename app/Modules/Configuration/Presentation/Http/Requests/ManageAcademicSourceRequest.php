<?php

namespace App\Modules\Configuration\Presentation\Http\Requests;

use App\Modules\Configuration\Infrastructure\Persistence\Models\AcademicSource;
use Illuminate\Foundation\Http\FormRequest;

class ManageAcademicSourceRequest extends FormRequest
{
    public function authorize(): bool
    {
        $source = $this->route('source');

        return $source instanceof AcademicSource && $this->user()?->can('manage-source', $source) === true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [];
    }
}
