<?php

namespace App\Modules\Syllabus\Presentation\Http\Requests;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateConvocationRequest extends FormRequest
{
    public function authorize(): bool
    {
        $convocation = $this->route('convocation');

        return $convocation instanceof Convocation && $this->user()?->can('update', $convocation) === true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        $convocation = $this->route('convocation');
        $preparing = $convocation instanceof Convocation && $convocation->estado === Convocation::STATE_PREPARATION;

        return [
            'nombre' => ['required', 'string', 'max:180'],
            // Periodo y agrupación solo antes de abrir: después ya hay expedientes.
            'period_id' => [
                Rule::requiredIf($preparing),
                'nullable',
                'uuid',
                Rule::exists('periodos_academicos', 'id')->where('activo', true),
            ],
            'grouping_mode' => [Rule::requiredIf($preparing), 'nullable', Rule::in(['por_oferta', 'por_paralelo'])],
            'source_ids' => ['required', 'array', 'min:1'],
            'source_ids.*' => ['required', 'uuid', 'distinct', 'exists:fuentes_academicas,id'],
        ];
    }

    /** @return array{nombre: string, period_id: string|null, grouping_mode: string|null, source_ids: list<string>} */
    public function convocationData(): array
    {
        $sourceIds = $this->input('source_ids', []);

        return [
            'nombre' => $this->string('nombre')->toString(),
            'period_id' => $this->filled('period_id') ? $this->string('period_id')->toString() : null,
            'grouping_mode' => $this->filled('grouping_mode') ? $this->string('grouping_mode')->toString() : null,
            'source_ids' => is_array($sourceIds)
                ? array_values(array_filter($sourceIds, is_string(...)))
                : [],
        ];
    }
}
