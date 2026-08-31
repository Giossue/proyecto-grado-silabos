<?php

namespace App\Modules\Configuration\Presentation\Http\Requests;

use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateSection;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateVersion;
use Illuminate\Validation\Rule;

class SaveTemplateSectionRequest extends ManageTemplatesRequest
{
    private const CONTENT_TYPES = ['text', 'table', 'bulleted_list', 'numbered_list'];

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        $version = $this->route('version');
        $versionId = $version instanceof TemplateVersion ? $version->id : $version;
        $section = $this->route('section');
        $sectionId = $section instanceof TemplateSection ? $section->id : null;

        return [
            'title' => ['required', 'string', 'max:180'],
            'key' => [
                Rule::requiredIf($sectionId === null),
                'nullable',
                'string',
                'regex:/^[a-z][a-z0-9_]*$/',
                'max:100',
                Rule::unique('secciones_plantilla', 'clave')
                    ->where('version_plantilla_id', $versionId)
                    ->ignore($sectionId),
            ],
            'first_field_label' => [Rule::requiredIf($sectionId === null), 'nullable', 'string', 'max:180'],
            'first_field_key' => [
                Rule::requiredIf($sectionId === null),
                'nullable',
                'string',
                'regex:/^[a-z][a-z0-9_]*$/',
                'max:120',
                Rule::unique('definiciones_campo', 'clave')->where('version_plantilla_id', $versionId),
            ],
            'first_field_content_type' => [
                Rule::requiredIf($sectionId === null),
                'nullable',
                Rule::in(self::CONTENT_TYPES),
            ],
        ];
    }
}
