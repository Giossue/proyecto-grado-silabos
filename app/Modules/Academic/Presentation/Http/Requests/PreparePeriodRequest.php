<?php

namespace App\Modules\Academic\Presentation\Http\Requests;

use App\Modules\Academic\Domain\AcademicStructurePermissions;
use App\Modules\Academic\Infrastructure\Persistence\Models\Parallel;
use App\Modules\Identity\Application\ActiveRole;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * «Preparar período» permite elegir materias y sus paralelos con jornada propia en un
 * solo envío.
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
                    $parallels = is_array($subject['parallels'] ?? null)
                        ? $subject['parallels']
                        : [];

                    return [
                        'id' => $subject['id'] ?? null,
                        'parallels' => collect($parallels)
                            ->filter(fn (mixed $parallel): bool => is_array($parallel))
                            ->map(fn (array $parallel): array => [
                                'code' => is_string($parallel['code'] ?? null)
                                    ? trim($parallel['code'])
                                    : '',
                                'shift' => $parallel['shift'] ?? null,
                            ])
                            ->filter(fn (array $parallel): bool => $parallel['code'] !== '')
                            ->unique('code')
                            ->values()
                            ->all(),
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
            'subjects.*.parallels' => ['required', 'array', 'min:1', 'max:50'],
            'subjects.*.parallels.*.code' => ['required', 'string', 'max:30'],
            'subjects.*.parallels.*.shift' => ['nullable', 'string', Rule::in(Parallel::SHIFTS)],
        ];
    }
}
