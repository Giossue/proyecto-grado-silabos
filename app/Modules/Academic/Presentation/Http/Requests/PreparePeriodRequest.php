<?php

namespace App\Modules\Academic\Presentation\Http\Requests;

use App\Modules\Academic\Domain\AcademicStructurePermissions;
use App\Modules\Academic\Infrastructure\Persistence\Models\Parallel;
use App\Modules\Identity\Application\ActiveRole;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * «Preparar período» permite elegir materias y sus paralelos en un solo envío.
 * Solo admite materias que todavía no tienen una oferta en el período elegido.
 */
class PreparePeriodRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        $subjects = $this->input('subjects');
        if (! is_array($subjects)) {
            return;
        }

        $this->merge([
            'subjects' => collect($subjects)
                ->filter(fn (mixed $subject): bool => is_array($subject))
                ->map(function (array $subject): array {
                    $codes = is_array($subject['codes'] ?? null) ? $subject['codes'] : [];

                    return [
                        'id' => $subject['id'] ?? null,
                        'codes' => collect($codes)
                            ->filter(fn (mixed $code): bool => is_string($code))
                            ->map(fn (string $code): string => trim($code))
                            ->filter(fn (string $code): bool => $code !== '')
                            ->unique()
                            ->values()
                            ->all(),
                        'shift' => $subject['shift'] ?? null,
                    ];
                })
                ->values()
                ->all(),
        ]);
    }

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
            'subjects' => ['required', 'array', 'min:1', 'max:200'],
            'subjects.*.id' => ['required', 'uuid', 'distinct'],
            'subjects.*.codes' => ['required', 'array', 'min:1', 'max:50'],
            'subjects.*.codes.*' => ['required', 'string', 'max:30'],
            'subjects.*.shift' => ['nullable', 'string', Rule::in(Parallel::SHIFTS)],
        ];
    }
}
