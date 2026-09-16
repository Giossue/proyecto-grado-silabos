<?php

namespace App\Http\Requests\Settings;

use App\Concerns\PasswordValidationRules;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Validator;

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
        if ($this->user()?->debe_cambiar_contrasena) {
            // La sesión acaba de autenticar la contraseña temporal. No se la pide de
            // nuevo, pero la nueva sigue sin poder repetirla.
            return ['password' => $this->passwordRules()];
        }

        return [
            'current_password' => $this->currentPasswordRules(),
            'password' => [...$this->passwordRules(), 'different:current_password'],
        ];
    }

    /** @return array<callable(Validator): void> */
    public function after(): array
    {
        return [function (Validator $validator): void {
            $user = $this->user();
            $password = $this->input('password');

            if ($user?->debe_cambiar_contrasena
                && is_string($password)
                && Hash::check($password, $user->contrasena)) {
                $validator->errors()->add(
                    'password',
                    'La contraseña nueva debe ser distinta de la temporal.',
                );
            }
        }];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'password.different' => 'La contraseña nueva debe ser distinta de la actual.',
        ];
    }
}
