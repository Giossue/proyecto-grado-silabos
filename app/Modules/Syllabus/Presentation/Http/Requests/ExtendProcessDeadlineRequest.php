<?php

namespace App\Modules\Syllabus\Presentation\Http\Requests;

use App\Modules\Syllabus\Application\ConvocationSchedule;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusProcess;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ExtendProcessDeadlineRequest extends FormRequest
{
    public function authorize(): bool
    {
        $process = $this->route('process');

        return $process instanceof SyllabusProcess
            && $this->user()?->can('extendDeadline', $process) === true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'stage' => ['required', Rule::in([ConvocationSchedule::STAGE_START, ConvocationSchedule::STAGE_DRAFT])],
            'due_at' => ['required', 'date'],
            // El motivo es obligatorio: una prórroga es una excepción y debe poder
            // explicarse después sin depender de la memoria de quien la concedió.
            'reason' => ['required', 'string', 'min:10', 'max:500'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'reason.required' => 'Indique el motivo de la prórroga.',
            'reason.min' => 'El motivo debe explicar la excepción, no solo nombrarla.',
        ];
    }
}
