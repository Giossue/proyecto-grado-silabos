<?php

namespace App\Modules\Academic\Presentation\Http\Requests;

use App\Modules\Academic\Domain\AcademicStructurePermissions;
use App\Modules\Identity\Application\ActiveRole;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** «Preparar periodo»: solo hace falta decir cuál (I-36). */
class PreparePeriodRequest extends FormRequest
{
    public function authorize(): bool
    {
        $activeRole = app(ActiveRole::class)->resolve($this);

        return $this->user()?->activo === true
            && $activeRole !== null
            && AcademicStructurePermissions::mayCreate($activeRole, 'oferta');
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'period_id' => [
                'required',
                'uuid',
                Rule::exists('periodos_academicos', 'id')->where('activo', true),
            ],
        ];
    }
}
