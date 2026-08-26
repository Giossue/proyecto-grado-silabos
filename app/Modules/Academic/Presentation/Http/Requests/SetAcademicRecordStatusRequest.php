<?php

namespace App\Modules\Academic\Presentation\Http\Requests;

use App\Modules\Academic\Domain\AcademicStructurePermissions;
use App\Modules\Identity\Application\ActiveRole;
use Illuminate\Foundation\Http\FormRequest;

class SetAcademicRecordStatusRequest extends FormRequest
{
    public function authorize(): bool
    {
        $entity = $this->route('entity');

        return is_string($entity)
            && $this->user()?->active === true
            && AcademicStructurePermissions::mayChangeStatus(
                app(ActiveRole::class)->resolve($this),
                $entity,
            );
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return ['active' => ['required', 'boolean']];
    }
}
