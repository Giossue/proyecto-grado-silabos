<?php

namespace App\Modules\Configuration\Presentation\Http\Requests;

use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateSection;
use Illuminate\Validation\Rule;

class SaveTemplateSectionRequest extends ManageTemplatesRequest
{
    private const CONTENT_TYPES = ['text', 'table', 'bulleted_list', 'numbered_list'];

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        $template = $this->route('template');
        $templateId = $template instanceof SyllabusTemplate ? $template->id : $template;
        $section = $this->route('section');
        $sectionId = $section instanceof TemplateSection ? $section->id : null;
        $hasFields = is_array($this->input('fields')) && $this->input('fields') !== [];
        $requiresLegacyField = $sectionId === null && ! $hasFields;

        return [
            'title' => ['required', 'string', 'max:180'],
            'key' => [
                Rule::requiredIf($sectionId === null),
                'nullable',
                'string',
                'regex:/^[a-z][a-z0-9_]*$/',
                'max:100',
                Rule::unique('secciones_plantilla', 'clave')
                    ->where('plantilla_id', $templateId)
                    ->ignore($sectionId),
            ],
            'fields' => [Rule::requiredIf($sectionId === null && ! $this->filled('first_field_label')), 'nullable', 'array', 'min:1', 'max:20'],
            'fields.*' => ['required', 'array:key,label,content_type'],
            'fields.*.label' => ['required', 'string', 'max:180'],
            'fields.*.key' => [
                'required',
                'string',
                'distinct',
                'regex:/^[a-z][a-z0-9_]*$/',
                'max:100',
                Rule::unique('definiciones_campo', 'clave')->where('plantilla_id', $templateId),
            ],
            'fields.*.content_type' => ['required', Rule::in(self::CONTENT_TYPES)],
            'first_field_label' => [Rule::requiredIf($requiresLegacyField), 'nullable', 'string', 'max:180'],
            'first_field_key' => [
                Rule::requiredIf($requiresLegacyField),
                'nullable',
                'string',
                'regex:/^[a-z][a-z0-9_]*$/',
                'max:120',
                Rule::unique('definiciones_campo', 'clave')->where('plantilla_id', $templateId),
            ],
            'first_field_content_type' => [
                Rule::requiredIf($requiresLegacyField),
                'nullable',
                Rule::in(self::CONTENT_TYPES),
            ],
            'position' => ['nullable', 'integer', 'min:0'],
        ];
    }
}
