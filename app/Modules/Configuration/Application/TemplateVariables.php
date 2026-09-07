<?php

namespace App\Modules\Configuration\Application;

use App\Modules\Syllabus\Application\IdentificationCard;

final class TemplateVariables
{
    /** @return array<string, array{label: string, source: string, equals?: string}> */
    public static function definitions(): array
    {
        return config('syllabus_variables');
    }

    /** @param array<string, mixed> $snapshot
     * @return array<string, string>
     */
    public static function resolve(array $snapshot): array
    {
        $values = [];
        foreach (self::definitions() as $key => $definition) {
            $value = data_get($snapshot, $definition['source']);
            $text = is_scalar($value) ? (string) $value : '';
            $values[$key] = isset($definition['equals']) ? ($text === $definition['equals'] ? 'X' : '') : $text;
        }

        return $values;
    }

    /** @return list<array{key: string, label: string, sample: string}> */
    public static function catalog(): array
    {
        $samples = self::resolve(['identification' => IdentificationCard::sample()]);
        $catalog = [];
        foreach (self::definitions() as $key => $definition) {
            $catalog[] = ['key' => $key, 'label' => $definition['label'], 'sample' => $samples[$key]];
        }

        return $catalog;
    }
}
