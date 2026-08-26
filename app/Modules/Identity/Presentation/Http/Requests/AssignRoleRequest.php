<?php

namespace App\Modules\Identity\Presentation\Http\Requests;

use App\Modules\Identity\Domain\Enums\RoleCode;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AssignRoleRequest extends FormRequest
{
    public function authorize(): bool
    {
        $target = $this->route('user');

        return $target !== null && $this->user()?->can('update', $target) === true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'role_code' => ['required', Rule::enum(RoleCode::class)],
            'career_id' => [
                'nullable',
                'required_unless:role_code,'.RoleCode::Administrator->value,
                'uuid',
                Rule::exists('carreras', 'id')->where('activo', true),
            ],
            'valid_from' => ['required', 'date'],
            'valid_until' => ['nullable', 'date', 'after:valid_from'],
        ];
    }
}
