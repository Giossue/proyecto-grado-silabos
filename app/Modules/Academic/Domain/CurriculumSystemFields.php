<?php

namespace App\Modules\Academic\Domain;

use App\Modules\Academic\Infrastructure\Persistence\Models\Subject;

final class CurriculumSystemFields
{
    /** @var list<string> */
    public const HOUR_COMPONENT_KEYS = [
        'hours_project',
        'hours_ap',
        'hours_ac',
        'hours_pae',
        'hours_aa',
        'hours_paec',
    ];

    /** @var array<string, string> */
    public const ATTRIBUTES = [
        'hours_project' => 'horas_proyecto',
        'hours_ap' => 'horas_ap',
        'hours_ac' => 'horas_ac',
        'hours_pae' => 'horas_pae',
        'hours_aa' => 'horas_aa',
        'hours_paec' => 'horas_paec',
        'credits' => 'creditos',
        'total_hours' => 'horas_totales',
    ];

    /** @var array<string, string> */
    public const LABELS = [
        'hours_project' => 'Horas de proyecto',
        'hours_ap' => 'Horas AP',
        'hours_ac' => 'Horas AC / ACD',
        'hours_pae' => 'Horas PAE / APE',
        'hours_aa' => 'Horas AA',
        'hours_paec' => 'Horas PAEC',
        'credits' => 'Créditos',
        'total_hours' => 'Horas totales',
    ];

    /** @return list<array{key: string, label: string, type: string, system_key: string, position: int, totalizable: bool}> */
    public static function defaults(): array
    {
        return [
            ['key' => 'acd', 'label' => 'ACD', 'type' => 'integer', 'system_key' => 'hours_ac', 'position' => 1, 'totalizable' => true],
            ['key' => 'ape', 'label' => 'APE', 'type' => 'integer', 'system_key' => 'hours_pae', 'position' => 2, 'totalizable' => true],
            ['key' => 'aa', 'label' => 'AA', 'type' => 'integer', 'system_key' => 'hours_aa', 'position' => 3, 'totalizable' => true],
            ['key' => 'cred', 'label' => 'CRED', 'type' => 'number', 'system_key' => 'credits', 'position' => 4, 'totalizable' => true],
            ['key' => 'total', 'label' => 'TOTAL', 'type' => 'integer', 'system_key' => 'total_hours', 'position' => 5, 'totalizable' => true],
        ];
    }

    public static function value(Subject $subject, string $systemKey): mixed
    {
        $attribute = self::ATTRIBUTES[$systemKey] ?? null;

        return $attribute === null ? null : $subject->getAttribute($attribute);
    }

    /**
     * @param  array<string, mixed>  $values
     * @param  iterable<string>|null  $activeSystemKeys
     */
    public static function totalHours(array $values, ?iterable $activeSystemKeys = null): int|float
    {
        $keys = $activeSystemKeys === null
            ? self::HOUR_COMPONENT_KEYS
            : array_values(array_intersect(self::HOUR_COMPONENT_KEYS, [...$activeSystemKeys]));

        return array_reduce(
            $keys,
            fn (int|float $total, string $key): int|float => $total
                + (is_numeric($values[$key] ?? null) ? $values[$key] + 0 : 0),
            0,
        );
    }
}
