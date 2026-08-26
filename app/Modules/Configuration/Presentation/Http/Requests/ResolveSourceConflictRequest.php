<?php

namespace App\Modules\Configuration\Presentation\Http\Requests;

use App\Modules\Configuration\Infrastructure\Persistence\Models\SourceConflict;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ResolveSourceConflictRequest extends FormRequest
{
    public function authorize(): bool
    {
        $conflict = $this->route('conflict');

        if (! $conflict instanceof SourceConflict) {
            return false;
        }

        $source = $conflict->candidateVersion()->firstOrFail()->source()->firstOrFail();

        return $this->user()?->can('manage-source', $source) === true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'decision' => ['required', Rule::in(['candidate', 'active'])],
            'justification' => ['required', 'string', 'min:10', 'max:2000'],
        ];
    }
}
