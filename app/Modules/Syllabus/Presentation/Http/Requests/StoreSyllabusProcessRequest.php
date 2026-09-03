<?php

namespace App\Modules\Syllabus\Presentation\Http\Requests;

use App\Modules\Syllabus\Application\ProcessDates;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusProcess;
use Illuminate\Foundation\Http\FormRequest;

class StoreSyllabusProcessRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', SyllabusProcess::class) === true;
    }

    /**
     * Las fechas llegan sin hora: el proceso empieza a las 00:00 del día de inicio y
     * recibe entregas hasta el final del día límite. Se resuelve antes de validar para
     * que «posterior a hoy» compare contra el final del día, no contra su madrugada.
     */
    protected function prepareForValidation(): void
    {
        $this->merge([
            'starts_at' => ProcessDates::startOfDay($this->input('starts_at')),
            'due_at' => ProcessDates::endOfDay($this->input('due_at')),
        ]);
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'nombre' => ['required', 'string', 'max:180'],
            'starts_at' => ['required', 'date'],
            'due_at' => ['required', 'date', 'after:now', 'after:starts_at'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'due_at.after' => 'La fecha de entrega debe ser posterior al inicio y a hoy.',
        ];
    }

    /** @return array{nombre: string, starts_at: string, due_at: string} */
    public function processData(): array
    {
        return [
            'nombre' => $this->string('nombre')->toString(),
            'starts_at' => $this->string('starts_at')->toString(),
            'due_at' => $this->string('due_at')->toString(),
        ];
    }
}
