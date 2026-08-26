<?php

namespace App\Modules\Academic\Presentation\Http\Requests;

use App\Modules\Academic\Domain\AcademicStructurePermissions;
use App\Modules\Identity\Application\ActiveRole;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateAcademicRecordRequest extends FormRequest
{
    public function authorize(): bool
    {
        $entity = $this->route('entity');

        return is_string($entity)
            && $this->user()?->active === true
            && AcademicStructurePermissions::mayUpdate(
                app(ActiveRole::class)->resolve($this),
                $entity,
            );
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return match ($this->route('entity')) {
            'faculty' => $this->namedCatalogRules('facultades', 180),
            'career' => [
                'faculty_id' => ['required', 'uuid', Rule::exists('facultades', 'id')],
                ...$this->namedCatalogRules('carreras', 180),
            ],
            'campus' => $this->namedCatalogRules('campus', 120),
            'modality' => [
                'code' => [
                    'required',
                    'string',
                    'max:40',
                    Rule::unique('modalidades', 'codigo')->ignore($this->recordId()),
                ],
                'name' => ['required', 'string', 'max:100'],
            ],
            'period' => [
                'code' => [
                    'required',
                    'string',
                    'max:40',
                    Rule::unique('periodos_academicos', 'codigo')->whereNull('carrera_id')->ignore($this->recordId()),
                ],
                'name' => ['required', 'string', 'max:120'],
                'starts_on' => ['required', 'date'],
                'ends_on' => ['required', 'date', 'after_or_equal:starts_on'],
            ],
            default => [],
        };
    }

    /** @return array<string, list<mixed>> */
    private function namedCatalogRules(string $table, int $nameLength): array
    {
        return [
            'code' => [
                'nullable',
                'string',
                'max:80',
                Rule::unique($table, 'codigo_institucional')->ignore($this->recordId()),
            ],
            'name' => ['required', 'string', "max:{$nameLength}"],
        ];
    }

    private function recordId(): string
    {
        $record = $this->route('record');

        return is_string($record) ? $record : '';
    }
}
