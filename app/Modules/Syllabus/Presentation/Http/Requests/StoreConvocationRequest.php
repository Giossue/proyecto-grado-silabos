<?php

namespace App\Modules\Syllabus\Presentation\Http\Requests;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreConvocationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', Convocation::class) === true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return ['process_id' => ['required', 'uuid', Rule::exists('procesos_silabos', 'id')->where('estado', 'abierto')]];
    }

    /** @return array{process_id: string} */
    public function convocationData(): array
    {
        return ['process_id' => $this->string('process_id')->toString()];
    }
}
