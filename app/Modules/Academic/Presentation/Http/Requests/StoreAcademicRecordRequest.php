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
use App\Modules\Configuration\Application\InstitutionalLogos;
use App\Modules\Identity\Application\ActiveRole;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Unique;

class StoreAcademicRecordRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        if ($this->route('entity') !== 'asignatura') {
            return;
        }

        $curriculumId = is_string($this->input('curriculum_id'))
            ? $this->input('curriculum_id')
            : '';

        $this->merge([
            'horas_totales' => CurriculumSystemFields::totalHours(
                $this->all(),
                $this->activeSubjectSystemKeys($curriculumId),
            ),
        ]);
    }

    public function authorize(): bool
    {
        $entity = $this->route('entity');

        return is_string($entity)
            && $this->user()?->activo === true
            && AcademicStructurePermissions::mayCreate(
                app(ActiveRole::class)->resolve($this),
                $entity,
            );
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return match ($this->route('entity')) {
            'facultad' => [
                ...$this->namedCatalogRules('facultades', 180),
                // El logo encabeza el sílabo de sus carreras: obligatorio desde el alta.
                'logo' => ['required', ...InstitutionalLogos::rules(InstitutionalLogos::FACULTY)],
            ],
            'campus' => $this->namedCatalogRules('campus', 120),
            'carrera' => [
                'faculty_id' => ['required', 'uuid', Rule::exists('facultades', 'id')->where('activo', true)],
                // La modalidad la aprueba el CES por carrera; las ofertas la heredan (I-35).
                'modality' => ['required', 'string', Rule::in(StudyModality::values())],
                'campus_id' => ['required', 'uuid', Rule::exists('campus', 'id')->where('activo', true)],
                ...$this->namedCatalogRules('carreras', 180),
            ],
            'periodo' => [
                'code' => [
                    'required',
                    'string',
                    'max:40',
                    Rule::unique('periodos_academicos', 'codigo'),
                ],
                'nombre' => ['required', 'string', 'max:120'],
                'starts_on' => ['required', 'date'],
                'ends_on' => ['required', 'date', 'after_or_equal:starts_on'],
            ],
            'malla' => [
                'code' => [
                    'required',
                    'string',
                    'max:80',
                    Rule::unique('mallas', 'codigo')->where(
                        'carrera_id',
                        app(ActiveRole::class)->resolve($this)?->carrera_id,
                    ),
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
                        ->where('periodo_academico_id', $this->input('period_id')),
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
                    $this->uniqueWithin('paralelos', 'codigo', 'oferta_academica_id', 'offering_id'),
                ],
                'shift' => ['nullable', 'string', Rule::in(Parallel::SHIFTS)],
            ],
            'asignacion_coordinador' => [
                ...$this->assignmentRules('carreras', 'career_id'),
                // Un encargo es un cargo distinto del titular, con duración propia y un
                // acto que lo respalda. La base exige la fecha de fin: un encargo sin ella
                // sería una titularidad sin nombrar.
                'quality' => ['nullable', Rule::in(['titular', 'encargado'])],
                'valid_until' => ['nullable', 'date', 'after:valid_from', 'required_if:quality,encargado'],
                'backing_type' => ['nullable', Rule::in(['accion_personal', 'resolucion', 'oficio'])],
                'backing_number' => ['nullable', 'string', 'max:80', 'required_if:quality,encargado'],
                'backing_date' => ['nullable', 'date', 'before_or_equal:today', 'required_if:quality,encargado'],
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
            ],
            default => [],
        };
    }

    /** @return array<string, list<mixed>> */
    private function namedCatalogRules(string $table, int $nameLength): array
    {
        return [
            'code' => ['nullable', 'string', 'max:80', Rule::unique($table, 'codigo_institucional')],
            'nombre' => ['required', 'string', "max:{$nameLength}"],
        ];
    }

    private function uniqueWithin(
        string $table,
        string $column,
        string $scopeColumn,
        ?string $input = null,
    ): Unique {
        $scopeValue = $this->input($input ?? $scopeColumn);

        return Rule::unique($table, $column)->where($scopeColumn, $scopeValue);
    }

    /** @return array<string, list<mixed>> */
    private function subjectRules(): array
    {
        $rules = [
            'curriculum_id' => [
                'required',
                'uuid',
                Rule::exists('mallas', 'id')
                    ->where('carrera_id', $this->careerId()),
            ],
            'code' => [
                'required',
                'string',
                'max:80',
                $this->uniqueWithin('asignaturas', 'codigo_institucional', 'malla_id', 'curriculum_id'),
            ],
            'nombre' => ['required', 'string', 'max:180'],
            'cycle' => ['required', 'integer', 'min:1', 'max:30'],
            'position' => ['nullable', 'integer', 'min:0', 'max:999'],
            'organization_unit' => ['required', 'string', 'max:80'],
            // Vacío = la de la carrera; otra modalidad es una excepción de la materia.
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

        $curriculumId = is_string($this->input('curriculum_id'))
            ? $this->input('curriculum_id')
            : '';
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

    /** @return array<string, list<mixed>> */
    private function assignmentRules(string $table, string $scope): array
    {
        return [
            'user_id' => ['required', 'uuid', Rule::exists('usuarios', 'id')->where('activo', true)],
            $scope => ['required', 'uuid', Rule::exists($table, 'id')->where('activo', true)],
            'valid_from' => ['required', 'date'],
            'valid_until' => ['nullable', 'date', 'after:valid_from'],
        ];
    }

    private function careerId(): ?string
    {
        return app(ActiveRole::class)->resolve($this)?->carrera_id;
    }
}
