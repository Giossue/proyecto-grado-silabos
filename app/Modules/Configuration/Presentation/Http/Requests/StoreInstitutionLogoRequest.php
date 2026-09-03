<?php

namespace App\Modules\Configuration\Presentation\Http\Requests;

use App\Modules\Configuration\Application\InstitutionalLogos;

class StoreInstitutionLogoRequest extends ManageTemplatesRequest
{
    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'logo' => ['required', ...InstitutionalLogos::rules(InstitutionalLogos::INSTITUTION)],
        ];
    }
}
