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
        $col = fn (string $key, string $label, string $type = 'text', ?string $group = null, ?string $band = null): array => compact('key', 'label', 'type', 'group', 'band');

        return [
            'planificacion' => [
                'columns' => [
                    $col('contenidos', 'Contenidos temáticos de la unidad'),
                    $col('semana', 'Semanas', 'number', null, 'horas'),
                    $col('acd', 'ACD', 'number', 'docencia', 'horas'),
                    $col('ape', 'APE', 'number', 'estudiante', 'horas'),
                    $col('aa', 'AA', 'number', 'estudiante', 'horas'),
                    $col('act_acd', 'Aprendizaje en contacto con el docente (ACD)', 'text', null, 'actividades'),
                    $col('act_ape', 'Aprendizaje práctico-experimental (APE)', 'text', null, 'actividades'),
                    $col('act_aa', 'Aprendizaje autónomo (AA)', 'text', null, 'actividades'),
                    $col('evaluacion', 'Evaluación de los aprendizajes'),
                ],
                'groups' => [['key' => 'docencia', 'label' => 'Docencia'], ['key' => 'estudiante', 'label' => 'Estudiante']],
                'bands' => [['key' => 'horas', 'label' => 'Horas por semana'], ['key' => 'actividades', 'label' => 'Actividades de aprendizaje']],
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
