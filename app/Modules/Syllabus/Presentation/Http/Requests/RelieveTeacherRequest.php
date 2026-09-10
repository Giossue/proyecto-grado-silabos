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
