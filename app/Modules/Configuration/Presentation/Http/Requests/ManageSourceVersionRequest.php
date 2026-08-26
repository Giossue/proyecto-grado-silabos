<?php

namespace App\Modules\Configuration\Presentation\Http\Requests;

use App\Modules\Configuration\Infrastructure\Persistence\Models\AcademicSource;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SourceVersion;
use Illuminate\Foundation\Http\FormRequest;

class ManageSourceVersionRequest extends FormRequest
{
    public function authorize(): bool
    {
        $version = $this->route('version');

        if (! $version instanceof SourceVersion) {
            return false;
        }

        $source = $version->source()->first();

        return $source instanceof AcademicSource && $this->user()?->can('manage-source', $source) === true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [];
    }
}
