<?php

namespace App\Modules\Configuration\Presentation\Http\Requests;

use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
use Illuminate\Validation\Rule;

class ReorderTemplateSectionsRequest extends ManageTemplatesRequest
{
    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        $template = $this->route('template');
        $templateId = $template instanceof SyllabusTemplate ? $template->id : $template;

        return [
            'section_ids' => ['required', 'array', 'min:1'],
            'section_ids.*' => [
                'required',
                'uuid',
                'distinct',
                Rule::exists('secciones_plantilla', 'id')->where('plantilla_id', $templateId),
            ],
        ];
    }
}
