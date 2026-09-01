<?php

namespace App\Modules\Syllabus\Presentation\Http\Requests;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use Illuminate\Foundation\Http\FormRequest;

class SubmitSyllabusRequest extends FormRequest
{
    public function authorize(): bool
    {
        $syllabus = $this->route('syllabus');

        return $syllabus instanceof Syllabus && $this->user()?->can('submit', $syllabus) === true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'version_bloqueo' => ['required', 'integer', 'min:0'],
            'idempotency_key' => ['required', 'uuid'],
        ];
    }
}
