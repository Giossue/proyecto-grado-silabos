<?php

namespace App\Modules\Syllabus\Presentation\Http\Requests;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use Illuminate\Foundation\Http\FormRequest;

class ResetSyllabusRequest extends FormRequest
{
    public function authorize(): bool
    {
        $syllabus = $this->route('syllabus');

        return $syllabus instanceof Syllabus && $this->user()?->can('reset', $syllabus) === true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        // Se descarta trabajo ajeno: el motivo tiene que quedar escrito.
        return ['reason' => ['required', 'string', 'min:10', 'max:2000']];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'reason.required' => 'Indique el motivo del reinicio.',
            'reason.min' => 'El motivo debe explicar por qué se descarta el trabajo, no solo nombrarlo.',
        ];
    }
}
