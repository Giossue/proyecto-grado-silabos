<?php

namespace App\Modules\Configuration\Presentation\Http\Requests;

use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateVersion;
use Illuminate\Validation\Rule;

class ReorderTemplateBlocksRequest extends ManageTemplatesRequest
{
    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        $version = $this->route('version');
        $versionId = $version instanceof TemplateVersion ? $version->id : $version;

        return [
            'section_id' => [
                'required',
                'uuid',
                Rule::exists('secciones_plantilla', 'id')->where('version_plantilla_id', $versionId),
            ],
            'block_ids' => ['required', 'array', 'min:1'],
            'block_ids.*' => [
                'required',
                'uuid',
                'distinct',
                Rule::exists('bloques_plantilla', 'id')->where('version_plantilla_id', $versionId),
            ],
        ];
    }
}
