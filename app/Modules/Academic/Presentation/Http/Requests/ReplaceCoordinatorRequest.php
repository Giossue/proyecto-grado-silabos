<?php

namespace App\Modules\Academic\Presentation\Http\Requests;

use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Reemplazar (o nombrar) la coordinación de una carrera: solo Administración (I-39). */
class ReplaceCoordinatorRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->activo === true
            && app(ActiveRole::class)->hasRole($this, RoleCode::Administrator);
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'incoming_user_id' => ['required', 'uuid', Rule::exists('usuarios', 'id')->where('activo', true)],
            'deactivate_outgoing' => ['nullable', 'boolean'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return ['incoming_user_id.required' => 'Elija a la persona que asumirá la coordinación.'];
    }
}
