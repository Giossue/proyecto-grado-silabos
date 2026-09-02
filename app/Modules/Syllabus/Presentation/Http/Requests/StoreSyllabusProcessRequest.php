<?php

namespace App\Modules\Syllabus\Presentation\Http\Requests;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusProcess;
use Illuminate\Foundation\Http\FormRequest;

class StoreSyllabusProcessRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', SyllabusProcess::class) === true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'nombre' => ['required', 'string', 'max:180'],
            'template_version_id' => ['required', 'uuid', 'exists:versiones_plantilla,id'],
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

    /** @return array{nombre: string, template_version_id: string, starts_at: string, due_at: string} */
    public function processData(): array
    {
        return [
            'nombre' => $this->string('nombre')->toString(),
            'template_version_id' => $this->string('template_version_id')->toString(),
            'starts_at' => $this->string('starts_at')->toString(),
            'due_at' => $this->string('due_at')->toString(),
        ];
    }
}
