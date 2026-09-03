<?php

namespace App\Modules\Academic\Presentation\Http\Requests;

use App\Modules\Academic\Domain\AcademicStructurePermissions;
use App\Modules\Academic\Infrastructure\Persistence\Models\Parallel;
use App\Modules\Academic\Infrastructure\Persistence\Models\Subject;
use App\Modules\Identity\Application\ActiveRole;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Crea varios paralelos de una oferta en una única operación atómica (I-40). */
class StoreParallelsRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        $codes = $this->input('codes');
        if (! is_array($codes)) {
            return;
        }

        $this->merge([
            'codes' => collect($codes)
                ->filter(fn (mixed $code): bool => is_string($code))
                ->map(fn (string $code) => trim($code))
                ->filter(fn (string $code) => $code !== '')
                ->values()
                ->all(),
        ]);
    }

    public function authorize(): bool
    {
        $activeRole = app(ActiveRole::class)->resolve($this);

        return $this->user()?->activo === true
            && $activeRole !== null
            && AcademicStructurePermissions::mayCreate($activeRole, 'paralelo');
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        $careerId = app(ActiveRole::class)->resolve($this)?->carrera_id;

        return [
            'offering_id' => [
                'required',
                'uuid',
                Rule::exists('ofertas_academicas', 'id')->where(fn ($query) => $query
                    ->where('activo', true)
                    ->whereIn('asignatura_id', Subject::query()
                        ->select('id')
                        ->whereHas('curriculum', fn ($curricula) => $curricula
                            ->where('carrera_id', $careerId)
                            ->where('estado', 'activa')))),
            ],
            'codes' => ['required', 'array', 'min:1', 'max:50'],
            'codes.*' => ['required', 'string', 'max:30', 'distinct'],
            'shift' => ['nullable', 'string', Rule::in(Parallel::SHIFTS)],
        ];
    }
}
