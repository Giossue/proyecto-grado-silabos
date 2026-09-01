<?php

namespace App\Modules\Syllabus\Presentation\Http\Requests;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use Illuminate\Foundation\Http\FormRequest;

class ViewReviewsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('reviewAny', Syllabus::class) === true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'state' => ['nullable', 'string', 'in:en_revision,correccion_solicitada,aprobado'],
            'search' => ['nullable', 'string', 'max:100'],
        ];
    }
}
