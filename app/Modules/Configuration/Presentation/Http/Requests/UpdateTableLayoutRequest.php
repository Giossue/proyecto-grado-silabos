<?php

namespace App\Modules\Configuration\Presentation\Http\Requests;

use App\Modules\Configuration\Domain\TableLayout;
use Illuminate\Validation\Rule;

/**
 * Forma del esquema de tabla. La coherencia fina (grupos contiguos, claves
 * conocidas) la comprueba `TableLayout::normalize`, que devuelve mensajes propios.
 */
class UpdateTableLayoutRequest extends ManageTemplatesRequest
{
    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        $key = ['required', 'string', 'max:60', 'regex:'.TableLayout::KEY_PATTERN];
        $label = ['required', 'string', 'max:180'];

        return [
            'columns' => ['required', 'array', 'min:1', 'max:24'],
            'columns.*.key' => $key,
            'columns.*.label' => $label,
            'columns.*.type' => ['required', Rule::in(TableLayout::TYPES)],
            'columns.*.group' => ['nullable', 'string', 'max:60'],
            'columns.*.band' => ['nullable', 'string', 'max:60'],
            'groups' => ['nullable', 'array', 'max:24'],
            'groups.*.key' => $key,
            'groups.*.label' => $label,
            'bands' => ['nullable', 'array', 'max:24'],
            'bands.*.key' => $key,
            'bands.*.label' => $label,
            'header_fields' => ['nullable', 'array', 'max:12'],
            'header_fields.*.key' => $key,
            'header_fields.*.label' => $label,
            'totals' => ['nullable', 'array'],
            'totals.enabled' => ['nullable', 'boolean'],
            'totals.label' => ['nullable', 'string', 'max:180'],
            'repeat' => ['nullable', 'array'],
            'repeat.enabled' => ['nullable', 'boolean'],
            'repeat.label' => ['nullable', 'string', 'max:180'],
            'confirm_purge' => ['nullable', 'boolean'],
        ];
    }
}
