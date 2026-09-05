<?php

namespace App\Modules\Syllabus\Presentation\Http\Requests;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use Illuminate\Foundation\Http\FormRequest;

class UpdateConvocationRequest extends FormRequest
{
    public function authorize(): bool
    {
        $convocation = $this->route('convocation');

        return $convocation instanceof Convocation && $this->user()?->can('update', $convocation) === true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'source_ids' => ['required', 'array', 'min:1'],
            'source_ids.*' => ['required', 'uuid', 'distinct', 'exists:fuentes_academicas,id'],
        ];
    }

    /** @return array{source_ids: list<string>} */
    public function convocationData(): array
    {
        $sourceIds = $this->input('source_ids', []);

        return [
            'source_ids' => is_array($sourceIds)
                ? array_values(array_filter($sourceIds, is_string(...)))
                : [],
        ];
    }
}
