<?php

namespace App\Modules\Syllabus\Presentation\Http\Requests;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class TransferSyllabusTeacherRequest extends FormRequest
{
    public function authorize(): bool
    {
        $syllabus = $this->route('syllabus');

        return $syllabus instanceof Syllabus
            && $this->user()?->can('transferTeacher', $syllabus) === true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'outgoing_user_id' => ['required', 'uuid', 'exists:usuarios,id'],
            'incoming_user_id' => [
                'required',
                'uuid',
                'different:outgoing_user_id',
                Rule::exists('usuarios', 'id')->where('activo', true),
            ],
            'idempotency_key' => ['required', 'string', 'max:120'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'incoming_user_id.different' => 'El docente entrante debe ser distinto del saliente.',
        ];
    }
}
