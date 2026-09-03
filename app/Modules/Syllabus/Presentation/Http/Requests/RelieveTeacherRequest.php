<?php

namespace App\Modules\Syllabus\Presentation\Http\Requests;

use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Relevo de un docente en todos sus paralelos de la carrera activa (I-39). */
class RelieveTeacherRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->activo === true
            && app(ActiveRole::class)->hasRole($this, RoleCode::Coordinator);
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'outgoing_user_id' => ['required', 'uuid', 'exists:usuarios,id'],
            'incoming_user_id' => ['required', 'uuid', 'different:outgoing_user_id', Rule::exists('usuarios', 'id')->where('activo', true)],
            'backing_type' => ['required', Rule::in(['accion_personal', 'resolucion', 'oficio'])],
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
