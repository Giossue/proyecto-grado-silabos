<?php

namespace App\Modules\Configuration\Presentation\Http\Requests;

use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateVersion;
use Illuminate\Validation\Rule;

class ReorderTemplateSectionsRequest extends ManageTemplatesRequest
{
    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        $version = $this->route('version');
        $versionId = $version instanceof TemplateVersion ? $version->id : $version;

        return [
            'section_ids' => ['required', 'array', 'min:1'],
            'section_ids.*' => [
                'required',
                'uuid',
                'distinct',
                Rule::exists('secciones_plantilla', 'id')->where('version_plantilla_id', $versionId),
            ],
        ];
    }
}
