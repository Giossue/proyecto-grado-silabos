<?php

namespace App\Modules\Operations\Presentation\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ViewJobExecutionsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('operate-jobs') === true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'q' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', 'string', 'in:pending,running,completed,failed'],
            'type' => ['nullable', 'string', 'max:120'],
            'queue' => ['nullable', 'string', 'max:80'],
        ];
    }
}
