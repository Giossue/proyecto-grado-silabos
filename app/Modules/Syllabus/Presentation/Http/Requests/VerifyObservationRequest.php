<?php

namespace App\Modules\Syllabus\Presentation\Http\Requests;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\ReviewObservation;
use Illuminate\Foundation\Http\FormRequest;

class VerifyObservationRequest extends FormRequest
{
    public function authorize(): bool
    {
        $observation = $this->route('observation');

        return $observation instanceof ReviewObservation
            && $this->user()?->can('review', $observation->revision) === true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [];
    }
}
