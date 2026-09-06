<?php

namespace App\Modules\Identity\Presentation\Http\Requests;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rules\Password;

class CreateCareerTeacherRequest extends FormRequest
{
    public function authorize(): bool
    {
        return Gate::allows('createCareerTeacher', User::class);
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('correo_electronico'))) {
            $this->merge(['correo_electronico' => mb_strtolower(trim($this->input('correo_electronico')))]);
        }
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'nombre' => ['required', 'string', 'max:180'],
            'correo_electronico' => ['required', 'string', 'email', 'max:255'],
            'password' => ['required', Password::min(12)->letters()->mixedCase()->numbers()->symbols()],
            'role_code' => ['prohibited'],
            'career_id' => ['prohibited'],
            'user_id' => ['prohibited'],
            'active' => ['prohibited'],
            'activo' => ['prohibited'],
        ];
    }

    /** @return array{nombre: string, correo_electronico: string, password: string} */
    public function teacherData(): array
    {
        return [
            'nombre' => $this->string('nombre')->toString(),
            'correo_electronico' => $this->string('correo_electronico')->toString(),
            'password' => $this->string('password')->toString(),
        ];
    }
}
