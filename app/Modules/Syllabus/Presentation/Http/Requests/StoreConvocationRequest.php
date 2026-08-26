<?php

namespace App\Modules\Syllabus\Presentation\Http\Requests;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreConvocationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', Convocation::class) === true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:180'],
            'period_id' => [
                'required',
                'uuid',
                Rule::exists('periodos_academicos', 'id')->where('activo', true),
            ],
            'template_version_id' => ['required', 'uuid', 'exists:versiones_plantilla,id'],
            'grouping_mode' => ['required', Rule::in(['per_offering', 'per_parallel'])],
            'source_version_ids' => ['required', 'array', 'min:1'],
            'source_version_ids.*' => ['required', 'uuid', 'distinct', 'exists:versiones_fuente,id'],
            'start_date' => ['required', 'date'],
            'draft_deadline' => ['required', 'date', 'after:now', 'after:start_date'],
        ];
    }

    /** @return array{name: string, period_id: string, template_version_id: string, grouping_mode: string, source_version_ids: list<string>, start_date: string, draft_deadline: string} */
    public function convocationData(): array
    {
        $sourceIds = $this->input('source_version_ids', []);

        return [
            'name' => $this->string('name')->toString(),
            'period_id' => $this->string('period_id')->toString(),
            'template_version_id' => $this->string('template_version_id')->toString(),
            'grouping_mode' => $this->string('grouping_mode')->toString(),
            'source_version_ids' => is_array($sourceIds)
                ? array_values(array_filter($sourceIds, is_string(...)))
                : [],
            'start_date' => $this->string('start_date')->toString(),
            'draft_deadline' => $this->string('draft_deadline')->toString(),
        ];
    }
}
