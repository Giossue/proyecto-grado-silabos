<?php

namespace App\Modules\Identity\Presentation\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SetUserStatusRequest extends FormRequest
{
    public function authorize(): bool
    {
        $target = $this->route('user');

        return $target !== null && $this->user()?->can('update', $target) === true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return ['active' => ['required', 'boolean']];
    }
}
