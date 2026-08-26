<?php

namespace App\Modules\Syllabus\Presentation\Http\Requests;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusRevision;
use Illuminate\Foundation\Http\FormRequest;

class StoreObservationRequest extends FormRequest
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
            'section_key' => ['nullable', 'string', 'max:100', 'required_with:field_key'],
            'field_key' => ['nullable', 'string', 'max:120'],
            'content' => ['required', 'string', 'max:10000'],
        ];
    }
}
