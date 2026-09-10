<?php

namespace App\Modules\Configuration\Presentation\Http\Requests;

use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Configuration\Application\InstitutionalLogos;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use Illuminate\Foundation\Http\FormRequest;

final class StoreFacultyLogoRequest extends FormRequest
{
    public function authorize(): bool
    {
        $activeRole = app(ActiveRole::class)->resolve($this);

        return $this->user()?->activo === true
            && $activeRole?->role->codigo === RoleCode::Coordinator->value
            && is_string($activeRole->carrera_id)
            && Career::query()->whereKey($activeRole->carrera_id)->whereHas('faculty')->exists();
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'logo' => ['required', ...InstitutionalLogos::rules(InstitutionalLogos::FACULTY)],
        ];
    }
}
