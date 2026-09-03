<?php

namespace App\Modules\Syllabus\Application;

use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\FieldValue;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use Illuminate\Support\Collection;

/**
 * Ficha de identificación institucional: la primera tabla del sílabo, calcada del
 * formato oficial (9 columnas, celdas combinadas por fila). Casi todo sale de datos
 * maestros; el docente solo llena discapacidad y su formación, que son campos del
 * mismo bloque y se imprimen dentro de la tabla. `build` reúne los valores, `grid`
 * los coloca en la cuadrícula que pintan la hoja, el editor, la revisión y el Word.
 *
 * Mapa celda → origen: docs/product/identificacion-institucional.md
 *
 * @phpstan-type Data array<string, string>
 * @phpstan-type Cell array{text: string, span: int, rows: int, style: string, bold: bool, small: bool, center: bool}
 */
final class IdentificationCard
{
    /** Claves de los campos del bloque que llena el docente y se imprimen en la ficha. */
    public const INPUT_KEYS = [
        'discapacidad_tiene' => 'disability',
        'discapacidad_tipo' => 'disability_type',
        'discapacidad_adaptacion' => 'disability_description',
        'formacion_experiencia' => 'formation',
    ];

    /** Jornada del paralelo tal como la escribe el formato. */
    public const SHIFT_LABELS = ['matutina' => 'Matutina', 'vespertina' => 'Vespertina', 'nocturna' => 'Nocturna'];

    /** Anchos de las 9 columnas del formato, en porcentaje. */
    public const WIDTHS = [15.9, 9.4, 4.6, 3.7, 8.5, 4.3, 13.8, 16.5, 23.2];

    /** @return Data */
    public static function fromSyllabus(Syllabus $syllabus): array
    {
        $syllabus->loadMissing(['scopes.parallel', 'teachers']);

        $data = self::build(
            $syllabus->contexto_academico ?? [],
            self::strings($syllabus->scopes->pluck('parallel.codigo')),
            self::strings($syllabus->teachers->pluck('nombre')),
            self::strings($syllabus->teachers->pluck('correo_electronico')),
            self::inputs($syllabus),
        );
        $data['shift'] = implode(', ', array_map(
            fn (string $shift): string => self::SHIFT_LABELS[$shift] ?? ucfirst($shift),
            self::strings($syllabus->scopes->pluck('parallel.jornada')),
        ));

        return $data;
    }

    /**
     * @param  array<string, mixed>  $context
     * @param  list<string>  $parallels
     * @param  list<string>  $teachers
     * @param  list<string>  $emails
     * @param  array<string, mixed>  $inputs  Valores escritos por el docente, por clave de campo.
     * @return Data
     */
    public static function build(array $context, array $parallels, array $teachers, array $emails, array $inputs = []): array
    {
        $get = fn (string $path): string => self::text(data_get($context, $path));
        $input = fn (string $key): string => self::text($inputs[$key] ?? null);

        return [
            'faculty' => $get('career.faculty'),
            'career' => $get('career.name'),
            'modality' => $get('offering.modality'),
            'campus' => $get('offering.campus'),
            'subject' => $get('subject.name'),
            'period' => $get('offering.period'),
            'cycle' => self::cycle(data_get($context, 'subject.cycle')),
            'parallel' => self::join($parallels),
            'shift' => '',
            'code' => $get('subject.code'),
            'prerequisites' => self::join(data_get($context, 'subject.prerequisites')) ?: 'Ninguno',
            'corequisites' => self::join(data_get($context, 'subject.corequisites')) ?: 'Ninguno',
            'organization_unit' => $get('subject.organization_unit'),
            'hours_ac' => $get('subject.hours_ac'),
            'hours_pae' => $get('subject.hours_pae'),
            'hours_aa' => $get('subject.hours_aa'),
            'total_hours' => $get('subject.total_hours'),
            'credits' => $get('subject.credits'),
            'teacher' => self::join($teachers),
            'email' => self::join($emails),
            'disability' => mb_strtolower(self::stripAccents($input('discapacidad_tiene'))),
            'disability_type' => $input('discapacidad_tipo'),
            'disability_description' => $input('discapacidad_adaptacion'),
            'formation' => $input('formacion_experiencia'),
        ];
    }

    /** @return Data Valores de muestra para la hoja de la plantilla. */
    public static function sample(): array
    {
        $data = self::build(
            [
                'career' => ['name' => 'Software', 'faculty' => 'Ciencias Administrativas, Gestión Empresarial e Informática'],
                'subject' => [
                    'name' => 'Lorem ipsum', 'code' => 'SW-P7-037', 'cycle' => 7, 'organization_unit' => 'profesional',
                    'prerequisites' => ['SW-P6-032'], 'corequisites' => [],
                    'hours_ac' => 32, 'hours_pae' => 16, 'hours_aa' => 48, 'total_hours' => 96, 'credits' => 2,
                ],
                'offering' => ['period' => 'Marzo – Julio 2026', 'campus' => 'Matriz', 'modality' => 'Presencial'],
            ],
            ['A'],
            ['NOMBRE DEL DOCENTE'],
            ['docente@ueb.edu.ec'],
            [
                'discapacidad_tiene' => 'No',
                'formacion_experiencia' => 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
            ],
        );
        $data['shift'] = 'Matutina';

        return $data;
    }

    /**
     * La cuadrícula del formato oficial, fila por fila. Cada celda sabe cuántas
     * columnas y filas abarca; las tapadas por una combinación vertical no se emiten.
     *
     * @param  array<string, mixed>  $data
     * @return list<list<Cell>>
     */
    public static function grid(array $data): array
    {
        $v = fn (string $key): string => is_scalar($data[$key] ?? null) ? (string) $data[$key] : '';
        $unit = mb_strtolower(self::stripAccents($v('organization_unit')));
        $mark = fn (string $needle): string => $unit !== '' && str_contains($unit, $needle) ? 'X' : '';
        $disability = $v('disability');

        $label = fn (string $text, int $span = 1, int $rows = 1, bool $shade = false): array => self::cell($text, $span, $rows, $shade ? 'shade' : 'plain', true, false, false);
        $value = fn (string $text, int $span = 1, int $rows = 1, bool $shade = false): array => self::cell($text, $span, $rows, $shade ? 'shade' : 'plain', false, false, false);
        $small = fn (string $text, int $span = 1, int $rows = 1, bool $shade = false): array => self::cell($text, $span, $rows, $shade ? 'shade' : 'plain', true, true, true);
        $number = fn (string $text, int $span = 1, bool $shade = false): array => self::cell($text, $span, 1, $shade ? 'shade' : 'plain', true, false, true);
        $note = fn (string $title, string $text, int $span): array => self::cell(trim($title.' '.$text), $span, 1, 'plain', false, true, false);

        return [
            [self::cell('FACULTAD: '.$v('faculty'), 9, 1, 'blue', true, false, false)],
            [$label('CARRERA:', 1, 1, true), $value($v('career'), 5, 1, true), $label('MODALIDAD DE ESTUDIO O APRENDIZAJE', 1, 1, true), $value($v('modality'), 2, 1, true)],
            [$label('CAMPUS UNIVERSITARIO:'), $value($v('campus'), 8)],
            [$label('ASIGNATURA', 2, 1, true), $label('PERIODO ACADÉMICO', 4, 1, true), $label('CICLO', 1, 1, true), $label('PARALELO', 1, 1, true), $label('JORNADA', 1, 1, true)],
            [$value($v('subject'), 2), $value($v('period'), 4), $value($v('cycle')), $value($v('parallel')), $value($v('shift'))],
            [$label('CÓDIGO:', 1, 1, true), $value($v('code'), 1, 1, true), $label('PRERREQUISITOS:', 3, 1, true), $value($v('prerequisites'), 2, 1, true), $label('CORREQUISITOS:', 1, 1, true), $value($v('corequisites'), 1, 1, true)],
            [$label('UNIDAD DE ORGANIZACIÓN CURRICULAR', 2, 3), $value('Unidad Básica', 6), $number($mark('basica'))],
            [$value('Unidad Profesional', 6, 1, true), $number($mark('profesional'), 1, true)],
            [$value('Unidad de Titulación', 6), $number($mark('titulacion'))],
            [$label('ESTUDIANTES CON DISCAPACIDAD', 2, 3), $value('Sí', 1, 2), self::cell($disability === 'si' ? 'X' : '', 1, 2, 'plain', true, false, true), $note('Tipo de discapacidad:', $v('disability_type'), 5)],
            [$note('Descripción de la adaptación curricular:', $v('disability_description'), 5)],
            [$value('No'), $number($disability === 'no' ? 'X' : ''), $value('', 5)],
            [$label('COMPONENTES DE APRENDIZAJE EN EL PERÍODO ACADÉMICO', 2, 4), $small('HORAS DEL PROFESOR', 3), $small('HORAS DEL ESTUDIANTE', 3), $small('TOTAL DE HORAS POR PERÍODO', 1, 2)],
            [$small('HORAS DE DOCENCIA (ACD)', 3, 1, true), $small('HORAS DE PRÁCTICAS DE APLICACIÓN O EXPERIMENTACIÓN (APE)', 2, 1, true), $small('HORAS DE APRENDIZAJE AUTÓNOMAS (AA)', 1, 1, true)],
            [$number($v('hours_ac'), 3), $number($v('hours_pae'), 2), $number($v('hours_aa')), $number($v('total_hours'))],
            [$small('TOTAL, CRÉDITOS', 6, 1, true), $number($v('credits'), 1, true)],
            [$label('NOMBRE DEL DOCENTE', 2), $value($v('teacher'), 5), $small('CORREO INSTITUCIONAL'), $value($v('email'))],
            // Última fila del formato: etiqueta en negrita y, debajo, el texto del docente.
            [self::cell("FORMACIÓN Y EXPERIENCIA ACADÉMICA – INVESTIGATIVA:\n".$v('formation'), 9, 1, 'plain', false, false, false)],
        ];
    }

    /**
     * Valores escritos por el docente en los campos del bloque de identificación.
     *
     * @return array<string, mixed>
     */
    private static function inputs(Syllabus $syllabus): array
    {
        $definitions = FieldDefinition::query()
            ->where('plantilla_id', $syllabus->plantilla_id)
            ->whereIn('clave', array_keys(self::INPUT_KEYS))
            ->get(['id', 'clave']);
        if ($definitions->isEmpty()) {
            return [];
        }
        $values = FieldValue::query()
            ->where('silabo_id', $syllabus->id)
            ->whereIn('definicion_campo_id', $definitions->pluck('id'))
            ->get(['definicion_campo_id', 'valor'])
            ->keyBy('definicion_campo_id');

        $inputs = [];
        foreach ($definitions as $definition) {
            $inputs[$definition->clave] = $values->get($definition->id)?->valor;
        }

        return $inputs;
    }

    /** @return Cell */
    private static function cell(string $text, int $span, int $rows, string $style, bool $bold, bool $small, bool $center): array
    {
        return ['text' => $text, 'span' => $span, 'rows' => $rows, 'style' => $style, 'bold' => $bold, 'small' => $small, 'center' => $center];
    }

    private static function cycle(mixed $value): string
    {
        $names = [1 => 'Primero', 'Segundo', 'Tercero', 'Cuarto', 'Quinto', 'Sexto', 'Séptimo', 'Octavo', 'Noveno', 'Décimo'];

        return is_numeric($value) && isset($names[(int) $value]) ? $names[(int) $value] : self::text($value);
    }

    private static function text(mixed $value): string
    {
        if ($value === null || is_array($value) || is_bool($value)) {
            return '';
        }

        return trim((string) $value);
    }

    private static function join(mixed $values): string
    {
        if (! is_array($values)) {
            return self::text($values);
        }
        $parts = [];
        foreach ($values as $item) {
            if (is_scalar($item) && trim((string) $item) !== '') {
                $parts[] = trim((string) $item);
            }
        }

        return implode(', ', $parts);
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

    private static function stripAccents(string $value): string
    {
        return strtr($value, ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'Á' => 'A', 'É' => 'E', 'Í' => 'I', 'Ó' => 'O', 'Ú' => 'U']);
    }
}
