<?php

namespace App\Modules\Syllabus\Presentation\Http\Requests;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusProcess;

class UpdateSyllabusProcessRequest extends StoreSyllabusProcessRequest
{
    public function authorize(): bool
    {
        $process = $this->route('process');

        return $process instanceof SyllabusProcess && $this->user()?->can('update', $process) === true;
    }
}
