<?php

namespace App\Modules\Identity\Presentation\Http\Requests;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateManagedUserProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        $target = $this->route('user');

        return $target instanceof User
            && $this->user()?->can('updateProfileData', $target) === true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        $target = $this->route('user');

        return [
            'name' => ['required', 'string', 'max:180'],
            'email' => [
                'required',
                'string',
                'email',
                'max:255',
                // Se excluye la propia cuenta: guardar sin tocar el correo no puede
                // fallar por duplicado consigo misma.
                Rule::unique('usuarios', 'email')->ignore(
                    $target instanceof User ? $target->id : null,
                ),
            ],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'email.unique' => 'Ya existe otra cuenta con este correo.',
        ];
    }

    /** @return array{name: string, email: string} */
    public function profileData(): array
    {
        return [
            'name' => $this->string('name')->toString(),
            'email' => $this->string('email')->toString(),
        ];
    }
}
