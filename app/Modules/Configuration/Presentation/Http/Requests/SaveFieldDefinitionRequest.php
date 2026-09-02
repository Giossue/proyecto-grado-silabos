<?php

namespace App\Modules\Configuration\Presentation\Http\Requests;

use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
use Illuminate\Validation\Rule;

class SaveFieldDefinitionRequest extends ManageTemplatesRequest
{
    private const TYPES = [
        'text',
        'table',
        'bulleted_list',
        'numbered_list',
    ];

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        $template = $this->route('template');
        $templateId = $template instanceof SyllabusTemplate ? $template->id : $template;
        $field = $this->route('field');
        $fieldId = $field instanceof FieldDefinition ? $field->id : null;

        return [
            'section_id' => [
                Rule::requiredIf($fieldId === null),
                'nullable',
                'uuid',
                Rule::exists('secciones_plantilla', 'id')->where('plantilla_id', $templateId),
            ],
            'position' => ['nullable', 'integer', 'min:0'],
            'block_id' => [
                Rule::requiredIf($fieldId !== null),
                'nullable',
                'uuid',
                Rule::exists('bloques_plantilla', 'id')->where('plantilla_id', $templateId),
            ],
            'key' => [
                'required',
                'string',
                'regex:/^[a-z][a-z0-9_]*$/',
                'max:120',
                Rule::unique('definiciones_campo', 'clave')
                    ->where('plantilla_id', $templateId)
                    ->ignore($fieldId),
            ],
            'label' => ['required', 'string', 'max:180'],
            'help' => ['nullable', 'string', 'max:2000'],
            'content_type' => ['required', Rule::in(self::TYPES)],
            'required' => ['nullable', 'boolean'],
            'inherited' => ['nullable', 'boolean'],
            'master_source' => ['nullable', 'required_if:inherited,true', 'string', 'max:100'],
            'teacher_editable' => ['nullable', 'boolean'],
            'ai_enabled' => ['nullable', 'boolean'],
            'rules' => ['nullable', 'array'],
            'options' => ['nullable', 'array'],
            'document_marker' => ['nullable', 'string', 'max:160'],
        ];
    }
}
