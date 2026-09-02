<?php

namespace App\Modules\Syllabus\Presentation\Http\Requests;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusProcess;
use Illuminate\Foundation\Http\FormRequest;

class ManageSyllabusProcessesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('viewAny', SyllabusProcess::class) === true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [];
    }
}
