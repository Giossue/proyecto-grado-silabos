<?php

namespace App\Modules\Integrations\Presentation\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class RequestImportSimulationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('operate-imports') === true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'profile' => ['required', 'string', 'in:baseline'],
            'idempotency_key' => ['required', 'uuid'],
        ];
    }
}
