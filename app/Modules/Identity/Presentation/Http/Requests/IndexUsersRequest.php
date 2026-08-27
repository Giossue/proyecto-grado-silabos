<?php

namespace App\Modules\Identity\Presentation\Http\Requests;

use App\Models\User;
use App\Modules\Identity\Domain\Enums\RoleCode;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class IndexUsersRequest extends FormRequest
{
    public function authorize(): bool
    {
        return Gate::allows('viewAny', User::class);
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'q' => ['nullable', 'string', 'max:120'],
            // «Sin estrenar» es un estado propio: la cuenta está activa pero nadie ha
            // entrado con ella. Sin filtro no hay forma de encontrarlas en una lista larga.
            'status' => ['nullable', Rule::in(['all', 'active', 'pending', 'inactive'])],
            'role' => ['nullable', Rule::in(['all', ...array_column(RoleCode::cases(), 'value')])],
            // Acepta «all» o el identificador de una carrera; el controlador descarta
            // cualquier otra cosa, que como filtro solo produce una lista vacía.
            'career' => ['nullable', 'string', 'max:36'],
            'page' => ['nullable', 'integer', 'min:1'],
        ];
    }
}
