<?php

namespace App\Modules\Identity\Presentation\Http\Requests;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;

class ShowManagedUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        $target = $this->route('user');

        return $target instanceof User && $this->user()?->can('view', $target) === true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [];
    }
}
