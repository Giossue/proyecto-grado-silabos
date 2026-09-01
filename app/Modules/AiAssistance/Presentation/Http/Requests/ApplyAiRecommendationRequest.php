<?php

namespace App\Modules\AiAssistance\Presentation\Http\Requests;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use Illuminate\Foundation\Http\FormRequest;

class ApplyAiRecommendationRequest extends FormRequest
{
    public function authorize(): bool
    {
        $syllabus = $this->route('syllabus');

        return $syllabus instanceof Syllabus && $this->user()?->can('edit', $syllabus) === true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return ['version_bloqueo' => ['required', 'integer', 'min:0']];
    }
}
