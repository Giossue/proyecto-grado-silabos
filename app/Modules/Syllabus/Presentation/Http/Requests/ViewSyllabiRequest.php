<?php

namespace App\Modules\Syllabus\Presentation\Http\Requests;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ViewSyllabiRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('viewAny', Syllabus::class) === true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'q' => ['nullable', 'string', 'max:120'],
            'state' => ['nullable', Rule::in([
                'all', 'sin_iniciar', 'borrador', 'en_revision', 'correccion_solicitada', 'aprobado',
            ])],
            'page' => ['nullable', 'integer', 'min:1'],
        ];
    }
}
