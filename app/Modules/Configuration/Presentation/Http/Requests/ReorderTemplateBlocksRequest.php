<?php

namespace App\Modules\Configuration\Presentation\Http\Requests;

use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
use Illuminate\Validation\Rule;

class ReorderTemplateBlocksRequest extends ManageTemplatesRequest
{
    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        $template = $this->route('template');
        $templateId = $template instanceof SyllabusTemplate ? $template->id : $template;

        return [
            'section_id' => [
                'required',
                'uuid',
                Rule::exists('secciones_plantilla', 'id')->where('plantilla_id', $templateId),
            ],
            'block_ids' => ['required', 'array', 'min:1'],
            'block_ids.*' => [
                'required',
                'uuid',
                'distinct',
                Rule::exists('bloques_plantilla', 'id')->where('plantilla_id', $templateId),
            ],
        ];
    }
}
