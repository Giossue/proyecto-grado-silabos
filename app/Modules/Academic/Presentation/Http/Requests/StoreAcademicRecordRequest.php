<?php

namespace App\Modules\Academic\Presentation\Http\Requests;

use App\Modules\Academic\Domain\AcademicStructurePermissions;
use App\Modules\Academic\Domain\CurriculumSystemFields;
use App\Modules\Academic\Domain\StudyModality;
use App\Modules\Academic\Infrastructure\Persistence\Models\Curriculum;
use App\Modules\Academic\Infrastructure\Persistence\Models\Parallel;
use App\Modules\Academic\Infrastructure\Persistence\Models\ScheduledSubject;
use App\Modules\Academic\Infrastructure\Persistence\Models\Subject;
use App\Modules\Configuration\Application\InstitutionalLogos;
use App\Modules\Identity\Application\ActiveRole;
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

        $this->merge([
            'horas_totales' => CurriculumSystemFields::totalHours($this->all()),
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
                // Administración puede adelantarlo; Coordinación lo completa desde su Panel.
                'logo' => ['nullable', ...InstitutionalLogos::rules(InstitutionalLogos::FACULTY)],
            ],
            'campus' => $this->namedCatalogRules('campus', 120),
            'carrera' => [
                'faculty_id' => ['required', 'uuid', Rule::exists('facultades', 'id')->where('activo', true)],
                // La modalidad la aprueba el CES por carrera; las programaciones la heredan (I-35).
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
                'starts_on' => ['required', 'date'],
                'ends_on' => ['required', 'date', 'after_or_equal:starts_on'],
                'teaching_weeks' => ['required', 'integer', 'min:1', 'max:52'],
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
            'programacion_asignatura' => [
                'period_id' => [
                    'required',
                    'uuid',
                    Rule::exists('periodos_academicos', 'id'),
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
                    Rule::unique('programaciones_asignatura', 'asignatura_id')
                        ->where('periodo_academico_id', $this->input('period_id')),
                ],
            ],
            'paralelo' => [
                'scheduled_subject_id' => [
                    'required',
                    'uuid',
                    Rule::exists('programaciones_asignatura', 'id')->where(fn ($query) => $query
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
                    $this->uniqueWithin('paralelos', 'codigo', 'programacion_asignatura_id', 'scheduled_subject_id'),
                ],
                'shift' => ['nullable', 'string', Rule::in(Parallel::SHIFTS)],
            ],
            'asignacion_coordinador' => [
                ...$this->assignmentRules('carreras', 'career_id'),
            ],
            'asignacion_docente' => [
                'user_id' => ['required', 'uuid', Rule::exists('usuarios', 'id')->where('activo', true)],
                'parallel_id' => [
                    'required',
                    'uuid',
                    Rule::exists('paralelos', 'id')->where(fn ($query) => $query
                        ->where('activo', true)
                        ->whereIn('programacion_asignatura_id', ScheduledSubject::query()
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
            'creditos' => ['required', 'numeric', 'min:0', 'max:9999.99'],
            'horas_totales' => ['required', 'integer', 'min:0', 'max:65535'],
            'hours_project' => ['nullable', 'numeric', 'min:0', 'max:9999.99'],
            'hours_ap' => ['nullable', 'numeric', 'min:0', 'max:9999.99'],
            'horas_ac' => ['required', 'numeric', 'min:0', 'max:9999.99'],
            'horas_pae' => ['required', 'numeric', 'min:0', 'max:9999.99'],
            'horas_aa' => ['required', 'numeric', 'min:0', 'max:9999.99'],
            'hours_paec' => ['nullable', 'numeric', 'min:0', 'max:9999.99'],
        ];

        return $rules;
    }

    /** @return array<string, list<mixed>> */
    private function assignmentRules(string $table, string $scope): array
    {
        return [
            'user_id' => ['required', 'uuid', Rule::exists('usuarios', 'id')->where('activo', true)],
            $scope => ['required', 'uuid', Rule::exists($table, 'id')->where('activo', true)],
        ];
    }

    private function careerId(): ?string
    {
        return app(ActiveRole::class)->resolve($this)?->carrera_id;
    }
}
