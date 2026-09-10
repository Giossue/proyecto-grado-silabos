<?php

namespace App\Modules\Configuration\Domain;

/**
 * Apariencia acotada del documento. Los valores son portables entre la vista HTML y
 * PHPWord; no se guardan reglas CSS ni nombres de clase enviados por el navegador.
 */
final class TemplateAppearance
{
    public const FONTS = ['Arial', 'Calibri', 'Times New Roman', 'Verdana', 'Georgia'];

    public const BODY_SIZES = [10, 11, 12];

    public const TITLE_SIZES = [14, 16, 18];

    public const SECTION_SIZES = [11, 12, 14];

    public const FIELD_SIZES = [10, 11, 12];

    public const MARGINS = [1.5, 2.0, 2.5, 3.0];

    public const ALIGNMENTS = ['left', 'center', 'right', 'justify'];

    public const ORIENTATIONS = ['portrait', 'landscape'];

    /** @var array<string, mixed> */
    private const INSTITUTIONAL_STYLE = [
        'font_family' => 'Arial',
        'text_color' => '#000000',
        'accent_color' => '#0070C0',
        'table_header_background' => '#4F81BD',
        'table_header_color' => '#FFFFFF',
        'title_bold' => true,
        'title_italic' => false,
        'title_alignment' => 'center',
        'section_bold' => true,
        'section_italic' => false,
        'section_alignment' => 'left',
        'body_alignment' => 'left',
    ];

    /** @var array<string, string> */
    public const COLORS = [
        '#000000' => 'Negro',
        '#FFFFFF' => 'Blanco',
        '#0070C0' => 'Azul institucional',
        '#1F4E78' => 'Azul oscuro',
        '#4F81BD' => 'Azul medio',
        '#DBE5F1' => 'Azul claro',
        '#595959' => 'Gris',
        '#E7E6E6' => 'Gris claro',
        '#C00000' => 'Rojo',
        '#548235' => 'Verde',
    ];

    /** @return array<string, mixed> */
    public static function defaults(): array
    {
        return [
            'font_family' => 'Arial',
            'body_font_size' => 11,
            'title_font_size' => 16,
            'section_font_size' => 12,
            'field_font_size' => 11,
            'text_color' => '#000000',
            'accent_color' => '#0070C0',
            'table_header_background' => '#4F81BD',
            'table_header_color' => '#FFFFFF',
            'margin_cm' => 2.5,
            'orientation' => 'portrait',
            'title_bold' => true,
            'title_italic' => false,
            'title_alignment' => 'center',
            'section_bold' => true,
            'section_italic' => false,
            'section_alignment' => 'left',
            'body_alignment' => 'left',
        ];
    }

    /**
     * @param  array<string, mixed>|null  $mapping
     * @return array<string, mixed>
     */
    public static function fromMapping(?array $mapping): array
    {
        $raw = is_array($mapping['appearance'] ?? null)
            ? $mapping['appearance']
            : [];

        return self::normalize($raw);
    }

    /**
     * @param  array<string, mixed>  $raw
     * @return array<string, mixed>
     */
    public static function normalize(array $raw): array
    {
        $defaults = self::defaults();
        $value = [
            ...$defaults,
            ...array_intersect_key($raw, $defaults),
            ...self::INSTITUTIONAL_STYLE,
        ];

        $value['font_family'] = self::allowed($value['font_family'], self::FONTS, $defaults['font_family']);
        $value['body_font_size'] = self::allowedInteger($value['body_font_size'], self::BODY_SIZES, $defaults['body_font_size']);
        $value['title_font_size'] = self::allowedInteger($value['title_font_size'], self::TITLE_SIZES, $defaults['title_font_size']);
        $value['section_font_size'] = self::allowedInteger($value['section_font_size'], self::SECTION_SIZES, $defaults['section_font_size']);
        // Campos, variables y texto comparten una sola escala dentro del documento.
        $value['field_font_size'] = $value['body_font_size'];

        foreach (['text_color', 'accent_color', 'table_header_background', 'table_header_color'] as $key) {
            $value[$key] = array_key_exists((string) $value[$key], self::COLORS)
                ? (string) $value[$key]
                : $defaults[$key];
        }

        $margin = is_numeric($value['margin_cm']) ? (float) $value['margin_cm'] : $defaults['margin_cm'];
        $value['margin_cm'] = in_array($margin, self::MARGINS, true) ? $margin : $defaults['margin_cm'];
        $value['orientation'] = self::allowed($value['orientation'], self::ORIENTATIONS, $defaults['orientation']);

        foreach (['title_bold', 'title_italic', 'section_bold', 'section_italic'] as $key) {
            $value[$key] = is_bool($value[$key]) ? $value[$key] : $defaults[$key];
        }

        foreach (['title_alignment', 'section_alignment', 'body_alignment'] as $key) {
            $value[$key] = self::allowed($value[$key], self::ALIGNMENTS, $defaults[$key]);
        }

        return $value;
    }

    /** @return array<string, mixed> */
    public static function catalog(): array
    {
        return [
            'fonts' => array_map(fn (string $font): array => ['value' => $font, 'label' => $font], self::FONTS),
            'body_sizes' => self::numberOptions(self::BODY_SIZES, 'pt'),
            'title_sizes' => self::numberOptions(self::TITLE_SIZES, 'pt'),
            'section_sizes' => self::numberOptions(self::SECTION_SIZES, 'pt'),
            'field_sizes' => self::numberOptions(self::FIELD_SIZES, 'pt'),
            'margins' => array_map(fn (float $margin): array => ['value' => $margin, 'label' => number_format($margin, 1, ',', '').' cm'], self::MARGINS),
            'colors' => array_map(
                fn (string $label, string $value): array => ['value' => $value, 'label' => $label],
                self::COLORS,
                array_keys(self::COLORS),
            ),
            'alignments' => [
                ['value' => 'left', 'label' => 'Izquierda'],
                ['value' => 'center', 'label' => 'Centro'],
                ['value' => 'right', 'label' => 'Derecha'],
                ['value' => 'justify', 'label' => 'Justificado'],
            ],
            'orientations' => [
                ['value' => 'portrait', 'label' => 'Vertical'],
                ['value' => 'landscape', 'label' => 'Horizontal'],
            ],
        ];
    }

    /** @param list<mixed> $allowed */
    private static function allowed(mixed $value, array $allowed, mixed $fallback): mixed
    {
        return in_array($value, $allowed, true) ? $value : $fallback;
    }

    /** @param list<int> $allowed */
    private static function allowedInteger(mixed $value, array $allowed, int $fallback): int
    {
        $integer = filter_var($value, FILTER_VALIDATE_INT);

        return is_int($integer) && in_array($integer, $allowed, true) ? $integer : $fallback;
    }

    /**
     * @param  list<int>  $values
     * @return list<array{value: int, label: string}>
     */
    private static function numberOptions(array $values, string $suffix): array
    {
        return array_map(fn (int $value): array => ['value' => $value, 'label' => "$value $suffix"], $values);
    }
}
