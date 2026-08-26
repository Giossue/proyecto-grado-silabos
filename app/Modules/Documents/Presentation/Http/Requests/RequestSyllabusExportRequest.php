<?php

namespace App\Modules\Documents\Presentation\Http\Requests;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusRevision;
use Illuminate\Foundation\Http\FormRequest;

class RequestSyllabusExportRequest extends FormRequest
{
    public function authorize(): bool
    {
        $revision = $this->route('revision');

        return $revision instanceof SyllabusRevision && $this->user()?->can('view', $revision) === true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return ['idempotency_key' => ['required', 'uuid']];
    }
}
