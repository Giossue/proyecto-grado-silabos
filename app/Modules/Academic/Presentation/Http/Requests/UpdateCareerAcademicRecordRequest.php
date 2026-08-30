<?php

namespace App\Modules\Academic\Presentation\Http\Requests;

use App\Modules\Academic\Domain\AcademicStructurePermissions;
use App\Modules\Academic\Infrastructure\Persistence\Models\CourseOffering;
use App\Modules\Academic\Infrastructure\Persistence\Models\CurriculumVersion;
use App\Modules\Academic\Infrastructure\Persistence\Models\Parallel;
use App\Modules\Academic\Infrastructure\Persistence\Models\Subject;
use App\Modules\Academic\Infrastructure\Persistence\Models\TeacherAssignment;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCareerAcademicRecordRequest extends FormRequest
{
    public function authorize(): bool
    {
        $entity = $this->route('entity');
        $activeRole = app(ActiveRole::class)->resolve($this);

        return is_string($entity)
            && $this->user()?->active === true
            && $activeRole instanceof RoleAssignment
            && AcademicStructurePermissions::mayUpdate($activeRole, $entity)
            && $this->recordBelongsToCareer($entity, $this->recordId(), $activeRole->carrera_id);
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return match ($this->route('entity')) {
            'curriculum' => [
                'code' => [
                    'required',
                    'string',
                    'max:80',
                    Rule::unique('versiones_malla', 'codigo')
                        ->where('carrera_id', $this->careerId())
                        ->ignore($this->recordId()),
                ],
                'version_number' => [
                    'required',
                    'integer',
                    'min:1',
                    'max:999',
                    Rule::unique('versiones_malla', 'numero_version')
                        ->where('carrera_id', $this->careerId())
                        ->ignore($this->recordId()),
                ],
            ],
            'subject' => [
                'code' => [
                    'required',
                    'string',
                    'max:80',
                    Rule::unique('asignaturas', 'codigo_institucional')
                        ->where('version_malla_id', $this->subjectCurriculumId())
                        ->ignore($this->recordId()),
                ],
                'name' => ['required', 'string', 'max:180'],
                'cycle' => ['nullable', 'integer', 'min:1', 'max:30'],
                'position' => ['nullable', 'integer', 'min:0', 'max:999'],
                'organization_unit' => ['nullable', 'string', 'max:80'],
                'credits' => ['nullable', 'numeric', 'min:0', 'max:9999.99'],
                'total_hours' => ['nullable', 'integer', 'min:0', 'max:65535'],
                'hours_project' => ['nullable', 'numeric', 'min:0', 'max:9999.99'],
                'hours_ap' => ['nullable', 'numeric', 'min:0', 'max:9999.99'],
                'hours_ac' => ['nullable', 'numeric', 'min:0', 'max:9999.99'],
                'hours_pae' => ['nullable', 'numeric', 'min:0', 'max:9999.99'],
                'hours_aa' => ['nullable', 'numeric', 'min:0', 'max:9999.99'],
                'hours_paec' => ['nullable', 'numeric', 'min:0', 'max:9999.99'],
                'custom_values' => ['nullable', 'array'],
                'custom_values.*' => ['nullable'],
            ],
            'offering' => [
                'period_id' => [
                    'required',
                    'uuid',
                    Rule::exists('periodos_academicos', 'id')->where(fn ($query) => $query
                        ->where('activo', true)
                        ->where(fn ($periods) => $periods
                            ->whereNull('carrera_id')
                            ->orWhere('carrera_id', $this->careerId()))),
                ],
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
                        ->where('modalidad_id', $this->input('modality_id'))
                        ->ignore($this->recordId()),
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
                    Rule::unique('paralelos', 'codigo')
                        ->where('oferta_academica_id', $this->input('offering_id'))
                        ->ignore($this->recordId()),
                ],
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

    private function recordBelongsToCareer(string $entity, string $recordId, ?string $careerId): bool
    {
        if ($careerId === null) {
            return false;
        }

        return match ($entity) {
            'curriculum' => CurriculumVersion::query()->whereKey($recordId)->where('carrera_id', $careerId)->exists(),
            'subject' => Subject::query()->whereKey($recordId)->whereHas(
                'curriculumVersion',
                fn ($query) => $query->where('carrera_id', $careerId),
            )->exists(),
            'offering' => CourseOffering::query()->whereKey($recordId)->whereHas(
                'subject.curriculumVersion',
                fn ($query) => $query->where('carrera_id', $careerId),
            )->exists(),
            'parallel' => Parallel::query()->whereKey($recordId)->whereHas(
                'offering.subject.curriculumVersion',
                fn ($query) => $query->where('carrera_id', $careerId),
            )->exists(),
            'teacher_assignment' => TeacherAssignment::query()->whereKey($recordId)->whereHas(
                'parallel.offering.subject.curriculumVersion',
                fn ($query) => $query->where('carrera_id', $careerId),
            )->exists(),
            default => false,
        };
    }

    private function subjectCurriculumId(): string
    {
        return (string) Subject::query()->whereKey($this->recordId())->value('version_malla_id');
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
