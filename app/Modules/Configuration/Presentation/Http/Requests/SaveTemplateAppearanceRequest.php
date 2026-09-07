<?php

namespace App\Modules\Configuration\Presentation\Http\Requests;

use App\Modules\Configuration\Domain\TemplateAppearance;
use Illuminate\Validation\Rule;

class SaveTemplateAppearanceRequest extends ManageTemplatesRequest
{
    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'font_family' => ['required', 'string', Rule::in(TemplateAppearance::FONTS)],
            'body_font_size' => ['required', 'integer', Rule::in(TemplateAppearance::BODY_SIZES)],
            'title_font_size' => ['required', 'integer', Rule::in(TemplateAppearance::TITLE_SIZES)],
            'section_font_size' => ['required', 'integer', Rule::in(TemplateAppearance::SECTION_SIZES)],
            'field_font_size' => ['required', 'integer', Rule::in(TemplateAppearance::FIELD_SIZES)],
            'text_color' => ['required', 'string', Rule::in(array_keys(TemplateAppearance::COLORS))],
            'accent_color' => ['required', 'string', Rule::in(array_keys(TemplateAppearance::COLORS))],
            'table_header_background' => ['required', 'string', Rule::in(array_keys(TemplateAppearance::COLORS))],
            'table_header_color' => ['required', 'string', Rule::in(array_keys(TemplateAppearance::COLORS))],
            'margin_cm' => ['required', 'numeric', Rule::in(TemplateAppearance::MARGINS)],
            'orientation' => ['required', 'string', Rule::in(TemplateAppearance::ORIENTATIONS)],
            'title_bold' => ['required', 'boolean'],
            'title_italic' => ['required', 'boolean'],
            'title_alignment' => ['required', 'string', Rule::in(TemplateAppearance::ALIGNMENTS)],
            'section_bold' => ['required', 'boolean'],
            'section_italic' => ['required', 'boolean'],
            'section_alignment' => ['required', 'string', Rule::in(TemplateAppearance::ALIGNMENTS)],
            'body_alignment' => ['required', 'string', Rule::in(TemplateAppearance::ALIGNMENTS)],
            'confirm_purge' => ['nullable', 'boolean'],
        ];
    }
}
