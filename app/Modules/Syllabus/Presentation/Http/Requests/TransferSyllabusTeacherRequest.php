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
                Rule::exists('usuarios', 'id')->where('active', true),
            ],
            // El relevo lo autoriza coordinación sustentada en un acto, no por su sola
            // voluntad: decisión B3 de la consulta del 2026-08-26.
            'backing_type' => ['required', Rule::in(['personnel_action', 'resolution', 'official_letter'])],
            'backing_number' => ['required', 'string', 'max:80'],
            'backing_date' => ['required', 'date', 'before_or_equal:today'],
            'idempotency_key' => ['required', 'string', 'max:120'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'incoming_user_id.different' => 'El docente entrante debe ser distinto del saliente.',
            'backing_number.required' => 'Indique el número del documento que respalda el relevo.',
            'backing_date.before_or_equal' => 'El documento no puede tener fecha futura.',
        ];
    }

    /** @return array{type: string, number: string, date: string} */
    public function backing(): array
    {
        return [
            'type' => $this->string('backing_type')->toString(),
            'number' => $this->string('backing_number')->toString(),
            'date' => $this->string('backing_date')->toString(),
        ];
    }
}
