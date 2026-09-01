<?php

namespace App\Modules\Configuration\Presentation\Http\Requests;

class UpdateSourceContentRequest extends ManageAcademicSourceRequest
{
    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'content' => ['nullable', 'string', 'max:100000'],
        ];
    }
}
