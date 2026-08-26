<?php

namespace App\Modules\Documents\Presentation\Http\Requests;

use App\Modules\Documents\Infrastructure\Persistence\Models\ExportArtifact;
use Illuminate\Foundation\Http\FormRequest;

class DownloadExportRequest extends FormRequest
{
    public function authorize(): bool
    {
        $artifact = $this->route('artifact');

        return $artifact instanceof ExportArtifact && $this->user()?->can('download', $artifact) === true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return ['format' => ['required', 'string', 'in:docx,pdf']];
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['format' => $this->route('format')]);
    }
}
