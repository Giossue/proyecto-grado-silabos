<?php

namespace App\Modules\Syllabus\Application;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use Illuminate\Support\Collection;

/**
 * Ficha de identificación institucional del sílabo (primera tabla del formato):
 * se arma con los datos maestros del contexto académico, los paralelos y los
 * docentes. Nadie la llena a mano. Cada fila trae uno o dos pares etiqueta/valor.
 *
 * @phpstan-type Pair array{label: string, value: string}
 */
final class IdentificationCard
{
    private const EMPTY = '—';

    /**
     * Ficha del expediente: contexto copiado, paralelos y docentes actuales.
     *
     * @return list<list<Pair>>
     */
    public static function fromSyllabus(Syllabus $syllabus): array
    {
        $syllabus->loadMissing(['scopes.parallel', 'teachers']);

        return self::rows(
            $syllabus->contexto_academico ?? [],
            self::strings($syllabus->scopes->pluck('parallel.codigo')),
            self::strings($syllabus->teachers->pluck('nombre')),
            self::strings($syllabus->teachers->pluck('correo_electronico')),
        );
    }

    /**
     * @param  Collection<int, mixed>  $values
     * @return list<string>
     */
    private static function strings(Collection $values): array
    {
        $strings = [];
        foreach ($values as $value) {
            if (is_string($value) && $value !== '' && ! in_array($value, $strings, true)) {
                $strings[] = $value;
            }
        }

        return $strings;
    }

    /**
     * @param  array<string, mixed>  $context
     * @param  list<string>  $parallels
     * @param  list<string>  $teachers
     * @param  list<string>  $emails
     * @return list<list<Pair>>
     */
    public static function rows(array $context, array $parallels, array $teachers, array $emails): array
    {
        $get = fn (string $path): string => self::text(data_get($context, $path));
        $list = fn (string $path): string => self::join(data_get($context, $path));

        return [
            [self::pair('Facultad', $get('career.faculty'))],
            [self::pair('Carrera', $get('career.name')), self::pair('Modalidad de estudio o aprendizaje', $get('offering.modality'))],
            [self::pair('Campus universitario', $get('offering.campus'))],
            [self::pair('Asignatura', $get('subject.name')), self::pair('Periodo académico', $get('offering.period'))],
            [self::pair('Ciclo', $get('subject.cycle')), self::pair('Paralelo', self::join($parallels))],
            [self::pair('Código', $get('subject.code')), self::pair('Unidad de organización curricular', $get('subject.organization_unit'))],
            [self::pair('Prerrequisitos', $list('subject.prerequisites')), self::pair('Correquisitos', $list('subject.corequisites'))],
            [self::pair('Horas de docencia (ACD)', $get('subject.hours_ac')), self::pair('Horas de aprendizaje práctico-experimental (APE)', $get('subject.hours_pae'))],
            [self::pair('Horas de aprendizaje autónomo (AA)', $get('subject.hours_aa')), self::pair('Total de horas por periodo', $get('subject.total_hours'))],
            [self::pair('Total de créditos', $get('subject.credits'))],
            [self::pair('Nombre del docente', self::join($teachers)), self::pair('Correo institucional', self::join($emails))],
        ];
    }

    /** @return Pair */
    private static function pair(string $label, string $value): array
    {
        return ['label' => $label, 'value' => $value];
    }

    private static function text(mixed $value): string
    {
        if ($value === null || $value === '' || is_array($value)) {
            return self::EMPTY;
        }

        return trim((string) $value) === '' ? self::EMPTY : trim((string) $value);
    }

    private static function join(mixed $values): string
    {
        if (! is_array($values)) {
            return self::text($values);
        }
        $parts = array_values(array_filter(
            array_map(fn (mixed $item): string => is_scalar($item) ? trim((string) $item) : '', $values),
            fn (string $item): bool => $item !== '',
        ));

        return $parts === [] ? self::EMPTY : implode(', ', $parts);
    }
}
