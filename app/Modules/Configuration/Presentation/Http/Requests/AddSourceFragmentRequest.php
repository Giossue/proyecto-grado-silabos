<?php

namespace App\Modules\Configuration\Presentation\Http\Requests;

class AddSourceFragmentRequest extends ManageSourceVersionRequest
{
    protected function prepareForValidation(): void
    {
        foreach (['structured_value', 'metadata'] as $key) {
            $value = $this->input($key);

            if (is_string($value) && $value !== '' && json_validate($value)) {
                $this->merge([$key => json_decode($value, true)]);
            }
        }
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'key' => ['required', 'string', 'regex:/^[a-z][a-z0-9_.-]*$/', 'max:120'],
            'title' => ['required', 'string', 'max:180'],
            'content' => ['nullable', 'required_without:structured_value', 'string', 'max:50000'],
            'data_key' => ['nullable', 'string', 'regex:/^[a-z][a-z0-9_.-]*$/', 'max:160'],
            'structured_value' => ['nullable', 'required_without:content', 'array'],
            'metadata' => ['nullable', 'array'],
        ];
    }
}
