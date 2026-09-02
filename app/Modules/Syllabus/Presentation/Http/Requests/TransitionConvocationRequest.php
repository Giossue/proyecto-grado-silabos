<?php

namespace App\Modules\Syllabus\Presentation\Http\Requests;

use App\Modules\Syllabus\Application\Actions\TransitionConvocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use Illuminate\Foundation\Http\FormRequest;

class TransitionConvocationRequest extends FormRequest
{
    /** @var array<string, string> */
    private const ABILITIES = [
        TransitionConvocation::PAUSE => 'pause',
        TransitionConvocation::RESUME => 'resume',
    ];

    public function authorize(): bool
    {
        $convocation = $this->route('convocation');
        $ability = self::ABILITIES[$this->transition()] ?? null;

        return $convocation instanceof Convocation
            && $ability !== null
            && $this->user()?->can($ability, $convocation) === true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        // Pausar detiene a los docentes de la carrera: el motivo tiene que quedar escrito.
        return $this->transition() === TransitionConvocation::PAUSE
            ? ['reason' => ['required', 'string', 'min:10', 'max:500']]
            : ['reason' => ['nullable', 'string', 'max:500']];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'reason.required' => 'Indique el motivo de la pausa.',
            'reason.min' => 'El motivo debe explicar la pausa, no solo nombrarla.',
        ];
    }

    public function transition(): string
    {
        $transition = $this->route('transition');

        return is_string($transition) ? $transition : '';
    }
}
