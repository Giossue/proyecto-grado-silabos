<?php

namespace App\Modules\Syllabus\Presentation\Http\Requests;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusRevision;
use Illuminate\Foundation\Http\FormRequest;

class StoreCorrectionRequest extends FormRequest
{
    public function authorize(): bool
    {
        $revision = $this->route('revision');

        return $revision instanceof SyllabusRevision && $this->user()?->can('review', $revision) === true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'observation_ids' => ['required', 'array', 'min:1', 'max:100'],
            'observation_ids.*' => ['required', 'uuid', 'distinct'],
            'justification' => ['required', 'string', 'min:10', 'max:10000'],
        ];
    }
}
