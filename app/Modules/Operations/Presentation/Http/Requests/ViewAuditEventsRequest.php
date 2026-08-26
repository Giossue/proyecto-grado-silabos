<?php

namespace App\Modules\Operations\Presentation\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ViewAuditEventsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('view-audit') === true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'action' => ['nullable', 'string', 'max:120'],
            'result' => ['nullable', 'string', 'in:success,failed,denied'],
            'search' => ['nullable', 'string', 'max:100'],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
        ];
    }
}
