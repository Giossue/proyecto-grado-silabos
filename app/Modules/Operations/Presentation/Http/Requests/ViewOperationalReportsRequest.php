<?php

namespace App\Modules\Operations\Presentation\Http\Requests;

use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use Illuminate\Foundation\Http\FormRequest;

class ViewOperationalReportsRequest extends FormRequest
{
    public function authorize(): bool
    {
        $activeRole = app(ActiveRole::class)->resolve($this);

        return $this->user()?->activo === true
            && $activeRole?->role->codigo === RoleCode::Coordinator->value
            && $activeRole->carrera_id !== null;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'convocation' => ['nullable', 'uuid'],
            'state' => ['nullable', 'string', 'in:not_started,draft,in_review,correction_requested,approved'],
            'search' => ['nullable', 'string', 'max:100'],
        ];
    }
}
