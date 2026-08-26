<?php

namespace App\Modules\Syllabus\Presentation\Http\Requests;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use Illuminate\Foundation\Http\FormRequest;

class OpenConvocationRequest extends FormRequest
{
    public function authorize(): bool
    {
        $convocation = $this->route('convocation');

        return $convocation instanceof Convocation && $this->user()?->can('open', $convocation) === true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [];
    }
}
