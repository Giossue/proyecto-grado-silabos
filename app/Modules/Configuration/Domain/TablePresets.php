<?php

namespace App\Modules\Configuration\Domain;

/**
 * Formatos de tabla del sílabo institucional, espejo de `tablePresets.ts` (la galería
 * de la hoja). Aquí los usa la plantilla por defecto; allá el administrador al soltar
 * una tabla nueva. Si se cambia uno, cambiar el otro.
 */
final class TablePresets
{
    /** @return array<string, mixed> Esquema canónico del formato pedido. */
    public static function layout(string $key): array
    {
        return TableLayout::normalize(self::raw()[$key] ?? throw new \InvalidArgumentException("Formato de tabla desconocido: {$key}"));
    }

    /** @return array<string, array<string, mixed>> */
    private static function raw(): array
    {
        $col = fn (string $key, string $label, string $type = 'text', ?string $group = null, ?string $band = null, bool $sum = true, ?int $width = null): array => ['key' => $key, 'label' => $label, 'type' => $type, 'group' => $group, 'band' => $band, 'sum' => $type === 'number' && $sum, 'width' => $width];

        return [
            // Calcada del formato oficial (sílabo IA-SW-2026): anchos en twips de la tabla
            // original, semanas fuera de la suma, cabeceras en dos niveles.
            'planificacion' => [
                'columns' => [
                    $col('contenidos', 'Contenidos temáticos de la unidad', 'text', null, null, true, 2121),
                    $col('semana', 'Semanas (16)', 'number', null, 'horas', false, 427),
                    $col('acd', 'ACD', 'number', 'docencia', 'horas', true, 849),
                    $col('ape', 'APE', 'number', 'estudiante', 'horas', true, 566),
                    $col('aa', 'AA', 'number', 'estudiante', 'horas', true, 566),
                    $col('act_acd', 'Aprendizaje en Contacto con el Docente (ACD)', 'text', null, 'actividades', true, 2553),
                    $col('act_ape', 'Aprendizaje práctico-experimental (APE)', 'text', null, 'actividades', true, 1843),
                    $col('act_aa', 'Aprendizaje autónomo (AA)', 'text', null, 'actividades', true, 2165),
                    $col('evaluacion', 'Evaluación de los aprendizajes', 'text', null, null, true, 2266),
                ],
                'groups' => [['key' => 'docencia', 'label' => 'DOCENCIA'], ['key' => 'estudiante', 'label' => 'ESTUDIANTE']],
                'bands' => [['key' => 'horas', 'label' => 'Horas por semana · Organización del aprendizaje'], ['key' => 'actividades', 'label' => 'ACTIVIDADES DE APRENDIZAJE']],
                'header_fields' => [['key' => 'nombre', 'label' => 'Nombre de la unidad'], ['key' => 'resultados', 'label' => 'Resultados de aprendizaje']],
                'totals' => ['enabled' => true, 'label' => 'Total, horas'],
                'repeat' => ['enabled' => true, 'label' => 'Unidad'],
            ],
            'bibliografia' => [
                'columns' => [
                    $col('autor', 'Autor'), $col('titulo', 'Título'), $col('anio', 'Año', 'number'),
                    $col('ciudad', 'Ciudad'), $col('editorial', 'Editorial'), $col('isbn', 'ISBN'), $col('codigo', 'Código'),
                ],
            ],
            'escala' => [
                'columns' => [
                    $col('cualitativa', 'Escala cualitativa'), $col('cuantitativa', 'Escala cuantitativa grado y posgrado'),
                    $col('equivalencia', 'Equivalencias'), $col('valoracion', 'Valoración de la asignatura'),
                ],
            ],
            'perfil' => [
                'columns' => [
                    $col('resultado', 'Resultados de aprendizaje de la asignatura'),
                    $col('alta', 'Alta (A)', 'text', 'nivel'), $col('media', 'Media (M)', 'text', 'nivel'), $col('baja', 'Baja (B)', 'text', 'nivel'),
                    $col('perfil', 'Resultados de aprendizaje que aportan al perfil de egreso de la carrera'),
                ],
                'groups' => [['key' => 'nivel', 'label' => 'Nivel de contribución']],
            ],
        ];
    }
}
