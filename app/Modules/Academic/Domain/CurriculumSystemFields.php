<?php

namespace App\Modules\Academic\Domain;

use App\Modules\Academic\Infrastructure\Persistence\Models\Subject;

final class CurriculumSystemFields
{
    /**
     * `hours_project`, `hours_ap` y `hours_paec` conservan la clave inglesa: la
     * migración I-28 (`definiciones_campo_malla.clave_sistema`) solo tradujo las
     * cinco claves restantes, por lo que la BD puede contener esos valores.
     *
     * @var list<string>
     */
    public const HOUR_COMPONENT_KEYS = [
        'hours_project',
        'hours_ap',
        'horas_ac',
        'horas_pae',
        'horas_aa',
        'hours_paec',
    ];

    /** @var array<string, string> */
    public const ATTRIBUTES = [
        'hours_project' => 'horas_proyecto',
        'hours_ap' => 'horas_ap',
        'horas_ac' => 'horas_ac',
        'horas_pae' => 'horas_pae',
        'horas_aa' => 'horas_aa',
        'hours_paec' => 'horas_paec',
        'creditos' => 'creditos',
        'horas_totales' => 'horas_totales',
    ];

    /** @var array<string, string> */
    public const LABELS = [
        'hours_project' => 'Horas de proyecto',
        'hours_ap' => 'Horas AP',
        'horas_ac' => 'Horas AC / ACD',
        'horas_pae' => 'Horas PAE / APE',
        'horas_aa' => 'Horas AA',
        'hours_paec' => 'Horas PAEC',
        'creditos' => 'Créditos',
        'horas_totales' => 'Horas totales',
    ];

    /** @return list<array{key: string, label: string, type: string, system_key: string, position: int, totalizable: bool}> */
    public static function defaults(): array
    {
        return [
            ['key' => 'acd', 'label' => 'ACD', 'type' => 'entero', 'system_key' => 'horas_ac', 'position' => 1, 'totalizable' => true],
            ['key' => 'ape', 'label' => 'APE', 'type' => 'entero', 'system_key' => 'horas_pae', 'position' => 2, 'totalizable' => true],
            ['key' => 'aa', 'label' => 'AA', 'type' => 'entero', 'system_key' => 'horas_aa', 'position' => 3, 'totalizable' => true],
            ['key' => 'cred', 'label' => 'CRED', 'type' => 'numero', 'system_key' => 'creditos', 'position' => 4, 'totalizable' => true],
            ['key' => 'total', 'label' => 'TOTAL', 'type' => 'entero', 'system_key' => 'horas_totales', 'position' => 5, 'totalizable' => true],
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
