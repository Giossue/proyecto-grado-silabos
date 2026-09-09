<?php

namespace App\Modules\Syllabus\Domain;

use App\Modules\Configuration\Domain\TableLayout;
use App\Modules\Syllabus\Application\AcademicContextValues;

/** Reglas determinísticas de la planificación microcurricular por unidades. */
final class PlanningTable
{
    /**
     * @param  array<string, mixed>  $layout
     * @return array<string, string> rol => clave de columna
     */
    public static function columns(array $layout): array
    {
        return TableLayout::columnsByRole($layout);
    }

    /** @param array<string, mixed> $layout */
    public static function applies(array $layout): bool
    {
        return TableLayout::isPlanning($layout);
    }

    /**
     * @param  array<string, mixed>  $layout
     * @param  iterable<mixed>  $rows
     * @return array{weeks: list<int>, totals: array{hours_acd: int, hours_ape: int, hours_aa: int}} Centésimas para evitar errores binarios.
     */
    public static function summary(array $layout, iterable $rows): array
    {
        $columns = self::columns($layout);
        $weeks = [];
        $totals = ['hours_acd' => 0, 'hours_ape' => 0, 'hours_aa' => 0];

        foreach ($rows as $row) {
            $data = self::data($row);
            if (($data['_kind'] ?? null) === 'unit') {
                continue;
            }
            $week = self::integer($data[$columns['week']] ?? null);
            if ($week !== null) {
                $weeks[] = $week;
            }
            foreach (array_keys($totals) as $role) {
                $value = self::hundredths($data[$columns[$role]] ?? null);
                if ($value !== null) {
                    $totals[$role] += $value;
                }
            }
        }

        sort($weeks);

        return ['weeks' => $weeks, 'totals' => $totals];
    }

    /**
     * @param  array<string, mixed>  $layout
     * @param  iterable<mixed>  $rows
     * @param  array<string, mixed>  $academicContext
     * @return list<array{code: string, message: string}>
     */
    public static function issues(array $layout, iterable $rows, array $academicContext): array
    {
        if (! self::applies($layout)) {
            return [];
        }

        $rows = is_array($rows) ? array_values($rows) : iterator_to_array($rows, false);
        $columns = self::columns($layout);
        $issues = [];
        $units = [];
        $headers = [];
        $unitRows = [];
        $weeks = [];

        foreach ($rows as $position => $row) {
            $data = self::data($row);
            $unit = self::integer($data['_unit'] ?? 1);
            if ($unit === null || $unit < 1) {
                $issues[] = ['code' => 'unidad_invalida', 'message' => 'Cada fila debe pertenecer a una unidad válida.'];

                continue;
            }
            $units[$unit] = true;
            if (($data['_kind'] ?? null) === 'unit') {
                $headers[$unit] = ($headers[$unit] ?? 0) + 1;
                foreach ($layout['header_fields'] ?? [] as $field) {
                    $key = $field['key'] ?? null;
                    if (is_string($key) && trim((string) ($data[$key] ?? '')) === '') {
                        $label = is_string($field['label'] ?? null) ? $field['label'] : 'dato de la unidad';
                        $issues[] = ['code' => 'cabecera_unidad_incompleta', 'message' => "Complete «{$label}» en la Unidad {$unit}."];
                    }
                }

                continue;
            }
            $unitRows[$unit] = ($unitRows[$unit] ?? 0) + 1;
            $week = self::integer($data[$columns['week']] ?? null);
            if ($week === null || $week < 1) {
                $issues[] = ['code' => 'semana_invalida', 'message' => 'Indique una semana entera positiva en cada fila de planificación.'];
            } else {
                $weeks[$week][] = $position + 1;
            }
            foreach (['hours_acd' => 'ACD', 'hours_ape' => 'APE', 'hours_aa' => 'AA'] as $role => $label) {
                $raw = $data[$columns[$role]] ?? null;
                $value = self::hundredths($raw);
                if ($value === null || $value < 0 || ! self::hasAtMostTwoDecimals($raw)) {
                    $issues[] = ['code' => 'hora_invalida', 'message' => "Las horas {$label} deben ser un número no negativo con máximo dos decimales."];
                }
            }
        }

        if ($units === []) {
            $issues[] = ['code' => 'unidad_faltante', 'message' => 'Agregue al menos una unidad de planificación.'];
        } else {
            ksort($units);
            $numbers = array_keys($units);
            if ($numbers !== range(1, count($numbers))) {
                $issues[] = ['code' => 'secuencia_unidades', 'message' => 'Las unidades deben conservar una numeración consecutiva desde 1.'];
            }
            foreach ($numbers as $unit) {
                if (($headers[$unit] ?? 0) !== 1) {
                    $issues[] = ['code' => 'cabecera_unidad_invalida', 'message' => "La Unidad {$unit} necesita una única cabecera con nombre y resultado."];
                }
                if (($unitRows[$unit] ?? 0) === 0) {
                    $issues[] = ['code' => 'fila_unidad_faltante', 'message' => "Agregue al menos una semana a la Unidad {$unit}."];
                }
            }
        }

        $duplicates = array_keys(array_filter($weeks, fn (array $positions): bool => count($positions) > 1));
        if ($duplicates !== []) {
            sort($duplicates);
            $issues[] = ['code' => 'semana_duplicada', 'message' => 'No repita semanas: '.implode(', ', $duplicates).'.'];
        }

        $teachingWeeks = self::integer(AcademicContextValues::scheduledSubject($academicContext, 'teaching_weeks'));
        if ($teachingWeeks !== null && $teachingWeeks > 0) {
            $outOfRange = array_values(array_filter(array_keys($weeks), fn (int $week): bool => $week > $teachingWeeks));
            if ($outOfRange !== []) {
                sort($outOfRange);
                $issues[] = ['code' => 'semana_fuera_periodo', 'message' => "El período admite {$teachingWeeks} semanas; revise: ".implode(', ', $outOfRange).'.'];
            }
            $missing = array_values(array_diff(range(1, $teachingWeeks), array_keys($weeks)));
            if ($missing !== []) {
                $issues[] = ['code' => 'semana_faltante', 'message' => 'Falta planificar '.self::compactNumbers($missing).'.'];
            }
        }

        $summary = self::summary($layout, $rows);
        foreach (['hours_acd' => ['hours_ac', 'ACD'], 'hours_ape' => ['hours_pae', 'APE'], 'hours_aa' => ['hours_aa', 'AA']] as $role => [$contextKey, $label]) {
            $expected = self::hundredths(data_get($academicContext, "subject.{$contextKey}"));
            if ($expected === null) {
                continue;
            }
            $actual = $summary['totals'][$role];
            if ($actual !== $expected) {
                $difference = $expected - $actual;
                $detail = $difference > 0
                    ? 'faltan '.self::displayHundredths($difference)
                    : 'sobran '.self::displayHundredths(abs($difference));
                $issues[] = [
                    'code' => 'horas_planificacion_no_coinciden',
                    'message' => "Horas {$label}: planificadas ".self::displayHundredths($actual).', esperadas '.self::displayHundredths($expected)."; {$detail}.",
                ];
            }
        }

        $totalHours = self::hundredths(data_get($academicContext, 'subject.total_hours'));
        $credits = self::hundredths(data_get($academicContext, 'subject.credits'));
        $componentHours = array_sum(array_filter([
            self::hundredths(data_get($academicContext, 'subject.hours_ac')),
            self::hundredths(data_get($academicContext, 'subject.hours_pae')),
            self::hundredths(data_get($academicContext, 'subject.hours_aa')),
        ], is_int(...)));
        if ($totalHours !== null && $componentHours !== $totalHours) {
            $issues[] = [
                'code' => 'componentes_horarios_no_coinciden',
                'message' => 'La malla registra '.self::displayHundredths($componentHours).' horas entre ACD, APE y AA, pero su total es '.self::displayHundredths($totalHours).'. Solicite corregir la configuración académica.',
            ];
        }
        if ($totalHours !== null && $credits !== null && $totalHours !== $credits * 48) {
            $issues[] = [
                'code' => 'creditos_no_coinciden',
                'message' => 'La malla registra '.self::displayHundredths($totalHours).' horas y '.self::displayHundredths($credits).' créditos; a 48 horas por crédito deberían coincidir. Solicite corregir la configuración académica.',
            ];
        }

        return self::uniqueIssues($issues);
    }

    /** @return array<string, mixed> */
    private static function data(mixed $row): array
    {
        if (is_object($row) && isset($row->datos) && is_array($row->datos)) {
            return $row->datos;
        }
        if (is_array($row) && is_array($row['data'] ?? null)) {
            return $row['data'];
        }
        if (is_array($row) && is_array($row['datos'] ?? null)) {
            return $row['datos'];
        }

        return is_array($row) ? $row : [];
    }

    private static function integer(mixed $value): ?int
    {
        if (! is_numeric($value) || (float) $value !== floor((float) $value)) {
            return null;
        }

        return (int) $value;
    }

    private static function hundredths(mixed $value): ?int
    {
        if (! is_numeric($value)) {
            return null;
        }

        return (int) round((float) $value * 100);
    }

    private static function hasAtMostTwoDecimals(mixed $value): bool
    {
        if (! is_numeric($value)) {
            return false;
        }

        return abs(((float) $value * 100) - round((float) $value * 100)) < 0.000001;
    }

    private static function displayHundredths(int $value): string
    {
        return rtrim(rtrim(number_format($value / 100, 2, '.', ''), '0'), '.');
    }

    /** @param list<int> $numbers */
    private static function compactNumbers(array $numbers): string
    {
        return (count($numbers) === 1 ? 'la semana ' : 'las semanas ').implode(', ', $numbers);
    }

    /**
     * @param  list<array{code: string, message: string}>  $issues
     * @return list<array{code: string, message: string}>
     */
    private static function uniqueIssues(array $issues): array
    {
        $unique = [];
        foreach ($issues as $issue) {
            $unique[$issue['code'].'|'.$issue['message']] = $issue;
        }

        return array_values($unique);
    }
}
