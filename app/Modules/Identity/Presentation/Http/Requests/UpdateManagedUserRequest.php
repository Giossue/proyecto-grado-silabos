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

        $touchesGovernance = $this->has('active') || $this->has('role_code')
            || $this->has('valid_from') || $this->has('valid_until');

        return ! $touchesGovernance || $this->user()->can('update', $target);
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        $target = $this->route('user');

        return [
            'nombre' => ['required', 'string', 'max:180'],
            'correo_electronico' => [
                'required',
                'string',
                'email',
                'max:255',
                // Se excluye la propia cuenta: guardar sin tocar el correo no puede
                // fallar por duplicado consigo misma.
                Rule::unique('usuarios', 'correo_electronico')->ignore(
                    $target instanceof User ? $target->id : null,
                ),
            ],
            'active' => ['sometimes', 'required', 'boolean'],
            'valid_from' => ['sometimes', 'nullable', 'date'],
            'valid_until' => ['sometimes', 'nullable', 'date', 'after_or_equal:valid_from'],
            // El bloque de rol es opcional, pero si llega, llega completo.
            'role_code' => ['sometimes', 'required', Rule::enum(RoleCode::class)],
            'career_id' => [
                'exclude_without:role_code',
                'nullable',
                'required_unless:role_code,'.RoleCode::Administrator->value,
                'uuid',
                Rule::exists('carreras', 'id')->where('activo', true),
            ],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'correo_electronico.unique' => 'Ya existe otra cuenta con este correo.',
        ];
    }

    /** @return array{nombre: string, correo_electronico: string, valid_from?: string|null, valid_until?: string|null} */
    public function profileData(): array
    {
        $data = [
            'nombre' => $this->string('nombre')->toString(),
            'correo_electronico' => $this->string('correo_electronico')->toString(),
        ];

        if ($this->has('valid_from')) {
            $data['valid_from'] = $this->filled('valid_from') ? $this->string('valid_from')->toString() : null;
        }

        if ($this->has('valid_until')) {
            $data['valid_until'] = $this->filled('valid_until') ? $this->string('valid_until')->toString() : null;
        }

        return $data;
    }
}
