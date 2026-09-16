<?php

namespace App\Modules\Academic\Presentation\Http\Requests;

use App\Modules\Academic\Domain\AcademicStructurePermissions;
use App\Modules\Academic\Domain\CurriculumSystemFields;
use App\Modules\Academic\Domain\StudyModality;
use App\Modules\Academic\Infrastructure\Persistence\Models\Parallel;
use App\Modules\Academic\Infrastructure\Persistence\Models\ScheduledSubject;
use App\Modules\Academic\Infrastructure\Persistence\Models\Subject;
use App\Modules\Academic\Infrastructure\Persistence\Models\TeacherAssignment;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
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
            'horas_totales' => CurriculumSystemFields::totalHours($this->all()),
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
                        ->where('asignatura_activa', true)
                        ->where('carrera_id', $this->careerId())),
                    Rule::unique('programaciones_asignatura', 'asignatura_id')
                        ->where('periodo_academico_id', $this->input('period_id'))
                        ->ignore($this->recordId()),
                ],
            ],
            'paralelo' => [
                'scheduled_subject_id' => [
                    'required',
                    'uuid',
                    Rule::exists('programaciones_asignatura', 'id')->where(fn ($query) => $query
                        ->where('programacion_asignatura_activa', true)
                        ->whereIn('asignatura_id', Subject::query()
                            ->select('id')
                            ->where('carrera_id', $this->careerId()))),
                ],
                'code' => [
                    'required',
                    'string',
                    'max:30',
                    Rule::unique('paralelos', 'codigo_paralelo')
                        ->where('programacion_asignatura_id', $this->input('scheduled_subject_id'))
                        ->ignore($this->recordId()),
                ],
                'shift' => ['nullable', 'string', Rule::in(Parallel::SHIFTS)],
            ],
            'asignacion_docente' => [
                'user_id' => ['required', 'uuid', Rule::exists('usuarios', 'id')->where('usuario_activo', true)],
                'parallel_id' => [
                    'required',
                    'uuid',
                    Rule::exists('paralelos', 'id')->where(fn ($query) => $query
                        ->whereIn('programacion_asignatura_id', ScheduledSubject::query()
                            ->select('id')
                            ->whereHas('subject', fn ($subject) => $subject
                                ->where('carrera_id', $this->careerId())))),
                ],
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
            'asignatura' => Subject::query()->whereKey($recordId)->where('carrera_id', $careerId)->exists(),
            'programacion_asignatura' => ScheduledSubject::query()->whereKey($recordId)->whereHas(
                'subject', fn ($query) => $query->where('carrera_id', $careerId),
            )->exists(),
            'paralelo' => Parallel::query()->whereKey($recordId)->whereHas(
                'scheduledSubject.subject', fn ($query) => $query->where('carrera_id', $careerId),
            )->exists(),
            'asignacion_docente' => TeacherAssignment::query()->whereKey($recordId)->whereHas(
                'parallel.scheduledSubject.subject', fn ($query) => $query->where('carrera_id', $careerId),
            )->exists(),
            default => false,
        };
    }

    /** @return array<string, list<mixed>> */
    private function subjectRules(): array
    {
        $careerId = $this->subjectCareerId();
        $rules = [
            'code' => [
                'required',
                'string',
                'max:80',
                Rule::unique('asignaturas', 'codigo_asignatura')
                    ->where('carrera_id', $careerId)
                    ->ignore($this->recordId()),
            ],
            'nombre' => ['required', 'string', 'max:180'],
            'cycle' => ['required', 'integer', 'min:1', 'max:30'],
            'position' => ['nullable', 'integer', 'min:0', 'max:999'],
            'organization_unit' => ['required', 'string', 'max:80'],
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

    private function subjectCareerId(): string
    {
        return (string) Subject::query()->whereKey($this->recordId())->value('carrera_id');
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
