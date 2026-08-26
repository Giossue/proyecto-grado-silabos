<?php

namespace App\Modules\Syllabus\Presentation\Http\Requests;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use Illuminate\Foundation\Http\FormRequest;

class RespondObservationRequest extends FormRequest
{
    public function authorize(): bool
    {
        $syllabus = $this->route('syllabus');

        return $syllabus instanceof Syllabus && $this->user()?->can('respond', $syllabus) === true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return ['content' => ['required', 'string', 'max:10000']];
    }
}
