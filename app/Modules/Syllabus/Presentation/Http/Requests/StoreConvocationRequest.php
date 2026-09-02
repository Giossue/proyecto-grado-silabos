<?php

namespace App\Modules\Syllabus\Presentation\Http\Requests;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreConvocationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', Convocation::class) === true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'nombre' => ['required', 'string', 'max:180'],
            // La plantilla y las fechas vienen del proceso: aquí solo se elige cuál.
            'process_id' => [
                'required',
                'uuid',
                Rule::exists('procesos_silabos', 'id')->whereNot('estado', 'cerrado'),
            ],
            'period_id' => [
                'required',
                'uuid',
                Rule::exists('periodos_academicos', 'id')->where('activo', true),
            ],
            'grouping_mode' => ['required', Rule::in(['por_oferta', 'por_paralelo'])],
            'source_ids' => ['required', 'array', 'min:1'],
            'source_ids.*' => ['required', 'uuid', 'distinct', 'exists:fuentes_academicas,id'],
        ];
    }

    /** @return array{nombre: string, process_id: string, period_id: string, grouping_mode: string, source_ids: list<string>} */
    public function convocationData(): array
    {
        $sourceIds = $this->input('source_ids', []);

        return [
            'nombre' => $this->string('nombre')->toString(),
            'process_id' => $this->string('process_id')->toString(),
            'period_id' => $this->string('period_id')->toString(),
            'grouping_mode' => $this->string('grouping_mode')->toString(),
            'source_ids' => is_array($sourceIds)
                ? array_values(array_filter($sourceIds, is_string(...)))
                : [],
        ];
    }
}
