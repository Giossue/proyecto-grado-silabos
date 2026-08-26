<?php

namespace App\Modules\Operations\Presentation\Http\Requests;

use App\Modules\Operations\Infrastructure\Persistence\Models\JobExecution;
use Illuminate\Foundation\Http\FormRequest;

class RetryJobExecutionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->route('execution') instanceof JobExecution
            && $this->user()?->can('operate-jobs') === true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [];
    }
}
