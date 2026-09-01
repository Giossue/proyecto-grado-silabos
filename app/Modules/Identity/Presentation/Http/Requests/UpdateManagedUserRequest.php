<?php

namespace App\Modules\Identity\Presentation\Http\Requests;

use App\Models\User;
use App\Modules\Identity\Domain\Enums\RoleCode;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Edición unificada de una cuenta: identidad siempre; estado y rol solo si vienen.
 *
 * Corregir nombre y correo lo autoriza `updateProfileData`, que admite la propia cuenta.
 * Tocar el estado o conceder un rol exige además `update`, que excluye la autogestión:
 * nadie se desactiva ni se concede roles a sí mismo.
 */
class UpdateManagedUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        $target = $this->route('user');

        if (! $target instanceof User || $this->user()?->can('updateProfileData', $target) !== true) {
            return false;
        }

        $touchesGovernance = $this->has('active') || $this->has('role_code');

        return ! $touchesGovernance || $this->user()->can('update', $target);
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
            'active' => ['sometimes', 'required', 'boolean'],
            // El bloque de rol es opcional, pero si llega, llega completo.
            'role_code' => ['sometimes', 'required', Rule::enum(RoleCode::class)],
            'career_id' => [
                'exclude_without:role_code',
                'nullable',
                'required_unless:role_code,'.RoleCode::Administrator->value,
                'uuid',
                Rule::exists('carreras', 'id')->where('activo', true),
            ],
            'valid_from' => ['exclude_without:role_code', 'required', 'date'],
            'valid_until' => ['exclude_without:role_code', 'nullable', 'date', 'after:valid_from'],
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
