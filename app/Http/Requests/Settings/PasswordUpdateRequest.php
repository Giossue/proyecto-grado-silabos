<?php

namespace App\Http\Requests\Settings;

use App\Concerns\PasswordValidationRules;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class PasswordUpdateRequest extends FormRequest
{
    use PasswordValidationRules;

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'current_password' => $this->currentPasswordRules(),
            // Repetir la actual (por ejemplo, la temporal que llegó por correo) no es
            // cambiarla: la contraseña seguiría siendo conocida por quien la generó.
            'password' => [...$this->passwordRules(), 'different:current_password'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'password.different' => 'La contraseña nueva debe ser distinta de la actual.',
        ];
    }
}
