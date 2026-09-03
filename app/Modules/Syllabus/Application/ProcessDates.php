<?php

namespace App\Modules\Syllabus\Application;

use Illuminate\Support\Carbon;

/**
 * Fechas del calendario de sílabos sin hora: un día empieza a las 00:00 y termina a
 * las 23:59:59. Si el valor ya trae hora (integraciones, pruebas), se respeta.
 */
final class ProcessDates
{
    private const DATE_ONLY = '/^\d{4}-\d{2}-\d{2}$/';

    public static function startOfDay(mixed $value): mixed
    {
        return is_string($value) && preg_match(self::DATE_ONLY, $value) === 1
            ? Carbon::parse($value)->startOfDay()->toIso8601String()
            : $value;
    }

    public static function endOfDay(mixed $value): mixed
    {
        return is_string($value) && preg_match(self::DATE_ONLY, $value) === 1
            ? Carbon::parse($value)->endOfDay()->toIso8601String()
            : $value;
    }
}
