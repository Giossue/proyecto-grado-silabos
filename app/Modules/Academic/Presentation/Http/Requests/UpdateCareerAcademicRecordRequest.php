<?php

namespace App\Modules\Academic\Presentation\Http\Requests;

use App\Modules\Academic\Domain\AcademicStructurePermissions;
use App\Modules\Academic\Domain\CurriculumSystemFields;
use App\Modules\Academic\Domain\StudyModality;
use App\Modules\Academic\Infrastructure\Persistence\Models\CourseOffering;
use App\Modules\Academic\Infrastructure\Persistence\Models\Curriculum;
use App\Modules\Academic\Infrastructure\Persistence\Models\CurriculumFieldDefinition;
use App\Modules\Academic\Infrastructure\Persistence\Models\Parallel;
use App\Modules\Academic\Infrastructure\Persistence\Models\Subject;
use App\Modules\Academic\Infrastructure\Persistence\Models\TeacherAssignment;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCareerAcademicRecordRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        if ($this->route('entity') !== 'asignatura') {
            return;
        }

        $this->merge([
            'horas_totales' => CurriculumSystemFields::totalHours(
                $this->all(),
                $this->activeSubjectSystemKeys($this->subjectCurriculumId()),
            ),
        ]);
    }

    public function authorize(): bool
    {
        $entity = $this->route('entity');
        $activeRole = app(ActiveRole::class)->resolve($this);

        return is_string($entity)
            && $this->user()?->activo === true
            && $activeRole instanceof RoleAssignment
            && AcademicStructurePermissions::mayUpdate($activeRole, $entity)
            && $this->recordBelongsToCareer($entity, $this->recordId(), $activeRole->carrera_id);
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return match ($this->route('entity')) {
            'malla' => [
                'code' => [
                    'required',
                    'string',
                    'max:80',
                    Rule::unique('mallas', 'codigo')
                        ->where('carrera_id', $this->careerId())
                        ->ignore($this->recordId()),
                ],
            ],
            'asignatura' => $this->subjectRules(),
            'oferta' => [
                'period_id' => [
                    'required',
                    'uuid',
                    Rule::exists('periodos_academicos', 'id')->where('activo', true),
                ],
                'subject_id' => [
                    'required',
                    'uuid',
                    Rule::exists('asignaturas', 'id')->where(fn ($query) => $query
                        ->where('activo', true)
                        ->whereIn('malla_id', Curriculum::query()
                            ->select('id')
                            ->where('carrera_id', $this->careerId())
                            ->where('estado', 'activa'))),
                    Rule::unique('ofertas_academicas', 'asignatura_id')
                        ->where('periodo_academico_id', $this->input('period_id'))
                        ->ignore($this->recordId()),
                ],
            ],
            'paralelo' => [
                'offering_id' => [
                    'required',
                    'uuid',
                    Rule::exists('ofertas_academicas', 'id')->where(fn ($query) => $query
                        ->where('activo', true)
                        ->whereIn('asignatura_id', Subject::query()
                            ->select('id')
                            ->whereHas('curriculum', fn ($curricula) => $curricula
                                ->where('carrera_id', $this->careerId())
                                ->where('estado', 'activa')))),
                ],
                'code' => [
                    'required',
                    'string',
                    'max:30',
                    Rule::unique('paralelos', 'codigo')
                        ->where('oferta_academica_id', $this->input('offering_id'))
                        ->ignore($this->recordId()),
                ],
                'shift' => ['nullable', 'string', Rule::in(Parallel::SHIFTS)],
            ],
            'asignacion_docente' => [
                'user_id' => ['required', 'uuid', Rule::exists('usuarios', 'id')->where('activo', true)],
                'parallel_id' => [
                    'required',
                    'uuid',
                    Rule::exists('paralelos', 'id')->where(fn ($query) => $query
                        ->where('activo', true)
                        ->whereIn('oferta_academica_id', CourseOffering::query()
                            ->select('id')
                            ->whereHas('subject.curriculum', fn ($curricula) => $curricula
                                ->where('carrera_id', $this->careerId())
                                ->where('estado', 'activa')))),
                ],
                'valid_from' => ['required', 'date'],
                'valid_until' => ['nullable', 'date', 'after:valid_from'],
            ],
            default => [],
        };
    }

    private function recordBelongsToCareer(string $entity, string $recordId, ?string $careerId): bool
    {
        if ($careerId === null) {
            return false;
        }

        return match ($entity) {
            'malla' => Curriculum::query()->whereKey($recordId)
                ->where('carrera_id', $careerId)->exists(),
            'asignatura' => Subject::query()->whereKey($recordId)->whereHas(
                'curriculum',
                fn ($query) => $query->where('carrera_id', $careerId),
            )->exists(),
            'oferta' => CourseOffering::query()->whereKey($recordId)->whereHas(
                'subject.curriculum',
                fn ($query) => $query->where('carrera_id', $careerId),
            )->exists(),
            'paralelo' => Parallel::query()->whereKey($recordId)->whereHas(
                'offering.subject.curriculum',
                fn ($query) => $query->where('carrera_id', $careerId),
            )->exists(),
            'asignacion_docente' => TeacherAssignment::query()->whereKey($recordId)->whereHas(
                'parallel.offering.subject.curriculum',
                fn ($query) => $query->where('carrera_id', $careerId),
            )->exists(),
            default => false,
        };
    }

    /** @return array<string, list<mixed>> */
    private function subjectRules(): array
    {
        $curriculumId = $this->subjectCurriculumId();
        $rules = [
            'code' => [
                'required',
                'string',
                'max:80',
                Rule::unique('asignaturas', 'codigo_institucional')
                    ->where('malla_id', $curriculumId)
                    ->ignore($this->recordId()),
            ],
            'nombre' => ['required', 'string', 'max:180'],
            'cycle' => ['required', 'integer', 'min:1', 'max:30'],
            'position' => ['nullable', 'integer', 'min:0', 'max:999'],
            'organization_unit' => ['required', 'string', 'max:80'],
            'modality' => ['nullable', 'string', Rule::in(StudyModality::values())],
            'creditos' => ['nullable', 'numeric', 'min:0', 'max:9999.99'],
            'horas_totales' => ['nullable', 'integer', 'min:0', 'max:65535'],
            'hours_project' => ['nullable', 'numeric', 'min:0', 'max:9999.99'],
            'hours_ap' => ['nullable', 'numeric', 'min:0', 'max:9999.99'],
            'horas_ac' => ['nullable', 'numeric', 'min:0', 'max:9999.99'],
            'horas_pae' => ['nullable', 'numeric', 'min:0', 'max:9999.99'],
            'horas_aa' => ['nullable', 'numeric', 'min:0', 'max:9999.99'],
            'hours_paec' => ['nullable', 'numeric', 'min:0', 'max:9999.99'],
            'custom_values' => ['nullable', 'array'],
            'custom_values.*' => ['nullable'],
        ];

        foreach ($this->activeSubjectFields($curriculumId) as $field) {
            if ($field->clave_sistema !== null && isset($rules[$field->clave_sistema])) {
                $rules[$field->clave_sistema][0] = 'required';

                continue;
            }

            if ($field->clave_sistema === null) {
                $rules['custom_values'][0] = 'required';
                $rules["custom_values.{$field->id}"] = ['required'];
            }
        }

        return $rules;
    }

    /** @return Collection<int, CurriculumFieldDefinition> */
    private function activeSubjectFields(string $curriculumId)
    {
        return CurriculumFieldDefinition::query()
            ->where('malla_id', $curriculumId)
            ->where('activo', true)
            ->whereHas('curriculum', fn ($query) => $query
                ->where('carrera_id', $this->careerId()))
            ->get(['id', 'clave_sistema']);
    }

    /** @return list<string> */
    private function activeSubjectSystemKeys(string $curriculumId): array
    {
        return array_values($this->activeSubjectFields($curriculumId)
            ->pluck('clave_sistema')
            ->filter(fn (mixed $key): bool => is_string($key))
            ->all());
    }

    private function subjectCurriculumId(): string
    {
        return (string) Subject::query()->whereKey($this->recordId())->value('malla_id');
    }

    private function recordId(): string
    {
        return is_string($this->route('record')) ? $this->route('record') : '';
    }

    private function careerId(): ?string
    {
        return app(ActiveRole::class)->resolve($this)?->carrera_id;
    }
}
