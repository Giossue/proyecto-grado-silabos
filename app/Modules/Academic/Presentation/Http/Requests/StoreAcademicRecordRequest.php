<?php

namespace App\Modules\Academic\Presentation\Http\Requests;

use App\Modules\Academic\Domain\AcademicStructurePermissions;
use App\Modules\Academic\Infrastructure\Persistence\Models\CourseOffering;
use App\Modules\Academic\Infrastructure\Persistence\Models\CurriculumVersion;
use App\Modules\Academic\Infrastructure\Persistence\Models\Subject;
use App\Modules\Identity\Application\ActiveRole;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Unique;

class StoreAcademicRecordRequest extends FormRequest
{
    public function authorize(): bool
    {
        $entity = $this->route('entity');

        return is_string($entity)
            && $this->user()?->active === true
            && AcademicStructurePermissions::mayCreate(
                app(ActiveRole::class)->resolve($this),
                $entity,
            );
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return match ($this->route('entity')) {
            'faculty' => $this->namedCatalogRules('facultades', 180),
            'campus' => $this->namedCatalogRules('campus', 120),
            'modality' => [
                'code' => ['required', 'string', 'max:40', Rule::unique('modalidades', 'codigo')],
                'name' => ['required', 'string', 'max:100'],
            ],
            'career' => [
                'faculty_id' => ['required', 'uuid', Rule::exists('facultades', 'id')->where('activo', true)],
                ...$this->namedCatalogRules('carreras', 180),
            ],
            'period' => [
                'code' => [
                    'required',
                    'string',
                    'max:40',
                    Rule::unique('periodos_academicos', 'codigo')->whereNull('carrera_id'),
                ],
                'name' => ['required', 'string', 'max:120'],
                'starts_on' => ['required', 'date'],
                'ends_on' => ['required', 'date', 'after_or_equal:starts_on'],
            ],
            'curriculum' => [
                'code' => [
                    'required',
                    'string',
                    'max:80',
                    Rule::unique('versiones_malla', 'codigo')->where(
                        'carrera_id',
                        app(ActiveRole::class)->resolve($this)?->carrera_id,
                    ),
                ],
                'version_number' => [
                    'required',
                    'integer',
                    'min:1',
                    'max:999',
                    Rule::unique('versiones_malla', 'numero_version')->where(
                        'carrera_id',
                        app(ActiveRole::class)->resolve($this)?->carrera_id,
                    ),
                ],
            ],
            'subject' => [
                'curriculum_id' => [
                    'required',
                    'uuid',
                    Rule::exists('versiones_malla', 'id')
                        ->where('estado', 'draft')
                        ->where('carrera_id', $this->careerId()),
                ],
                'code' => [
                    'required',
                    'string',
                    'max:80',
                    $this->uniqueWithin('asignaturas', 'codigo_institucional', 'version_malla_id', 'curriculum_id'),
                ],
                'name' => ['required', 'string', 'max:180'],
                'cycle' => ['nullable', 'integer', 'min:1', 'max:20'],
                'credits' => ['nullable', 'numeric', 'min:0', 'max:9999.99'],
                'total_hours' => ['nullable', 'integer', 'min:0', 'max:65535'],
            ],
            'offering' => [
                'period_id' => ['required', 'uuid', Rule::exists('periodos_academicos', 'id')->where('activo', true)],
                'subject_id' => [
                    'required',
                    'uuid',
                    Rule::exists('asignaturas', 'id')->where(fn ($query) => $query
                        ->where('activo', true)
                        ->whereIn('version_malla_id', CurriculumVersion::query()
                            ->select('id')
                            ->where('carrera_id', $this->careerId())
                            ->where('estado', 'published'))),
                    Rule::unique('ofertas_academicas', 'asignatura_id')
                        ->where('periodo_academico_id', $this->input('period_id'))
                        ->where('campus_id', $this->input('campus_id'))
                        ->where('modalidad_id', $this->input('modality_id')),
                ],
                'campus_id' => ['required', 'uuid', Rule::exists('campus', 'id')->where('activo', true)],
                'modality_id' => ['required', 'uuid', Rule::exists('modalidades', 'id')->where('activo', true)],
            ],
            'parallel' => [
                'offering_id' => [
                    'required',
                    'uuid',
                    Rule::exists('ofertas_academicas', 'id')->where(fn ($query) => $query
                        ->where('activo', true)
                        ->whereIn('asignatura_id', Subject::query()
                            ->select('id')
                            ->whereHas('curriculumVersion', fn ($curricula) => $curricula
                                ->where('carrera_id', $this->careerId())))),
                ],
                'code' => [
                    'required',
                    'string',
                    'max:30',
                    $this->uniqueWithin('paralelos', 'codigo', 'oferta_academica_id', 'offering_id'),
                ],
            ],
            'coordinator_assignment' => [
                ...$this->assignmentRules('carreras', 'career_id'),
                // Un encargo es un cargo distinto del titular, con duración propia y un
                // acto que lo respalda. La base exige la fecha de fin: un encargo sin ella
                // sería una titularidad sin nombrar.
                'quality' => ['nullable', Rule::in(['titular', 'encargado'])],
                'valid_until' => ['nullable', 'date', 'after:valid_from', 'required_if:quality,encargado'],
                'backing_type' => ['nullable', Rule::in(['personnel_action', 'resolution', 'official_letter'])],
                'backing_number' => ['nullable', 'string', 'max:80', 'required_if:quality,encargado'],
                'backing_date' => ['nullable', 'date', 'before_or_equal:today', 'required_if:quality,encargado'],
            ],
            'teacher_assignment' => [
                'user_id' => ['required', 'uuid', Rule::exists('usuarios', 'id')->where('active', true)],
                'parallel_id' => [
                    'required',
                    'uuid',
                    Rule::exists('paralelos', 'id')->where(fn ($query) => $query
                        ->where('activo', true)
                        ->whereIn('oferta_academica_id', CourseOffering::query()
                            ->select('id')
                            ->whereHas('subject.curriculumVersion', fn ($curricula) => $curricula
                                ->where('carrera_id', $this->careerId())))),
                ],
                'valid_from' => ['required', 'date'],
                'valid_until' => ['nullable', 'date', 'after:valid_from'],
            ],
            default => [],
        };
    }

    /** @return array<string, list<mixed>> */
    private function namedCatalogRules(string $table, int $nameLength): array
    {
        return [
            'code' => ['nullable', 'string', 'max:80', Rule::unique($table, 'codigo_institucional')],
            'name' => ['required', 'string', "max:{$nameLength}"],
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
    private function assignmentRules(string $table, string $scope): array
    {
        return [
            'user_id' => ['required', 'uuid', Rule::exists('usuarios', 'id')->where('active', true)],
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
