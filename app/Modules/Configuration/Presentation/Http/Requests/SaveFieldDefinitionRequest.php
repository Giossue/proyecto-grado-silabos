<?php

namespace App\Modules\Configuration\Presentation\Http\Requests;

use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateVersion;
use Illuminate\Validation\Rule;

class SaveFieldDefinitionRequest extends ManageTemplatesRequest
{
    private const TYPES = [
        'short_text',
        'long_text',
        'markdown',
        'number',
        'date',
        'single_select',
        'multi_select',
        'boolean',
        'repeatable',
        'calculation',
        'master_reference',
    ];

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        $version = $this->route('version');
        $versionId = $version instanceof TemplateVersion ? $version->id : $version;
        $field = $this->route('field');
        $fieldId = $field instanceof FieldDefinition ? $field->id : null;

        return [
            'block_id' => [
                'required',
                'uuid',
                Rule::exists('bloques_plantilla', 'id')->where('version_plantilla_id', $versionId),
            ],
            'key' => [
                'required',
                'string',
                'regex:/^[a-z][a-z0-9_]*$/',
                'max:120',
                Rule::unique('definiciones_campo', 'clave')
                    ->where('version_plantilla_id', $versionId)
                    ->ignore($fieldId),
            ],
            'label' => ['required', 'string', 'max:180'],
            'help' => ['nullable', 'string', 'max:2000'],
            'type' => ['required', Rule::in(self::TYPES)],
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
