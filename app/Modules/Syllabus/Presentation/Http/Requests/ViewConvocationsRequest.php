<?php

namespace App\Modules\Syllabus\Presentation\Http\Requests;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ViewConvocationsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('viewAny', Convocation::class) === true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'q' => ['nullable', 'string', 'max:120'],
            'state' => ['nullable', Rule::in(['all', 'preparation', 'open', 'closed'])],
            'page' => ['nullable', 'integer', 'min:1'],
        ];
    }
}
