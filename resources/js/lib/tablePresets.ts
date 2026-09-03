import type { TableLayout } from '@/lib/tableLayout';

/**
 * Formatos de tabla del sílabo institucional. El administrador elige uno y, si
 * acaso, renombra: nadie arma la tabla de unidades columna por columna.
 */
export type TablePreset = {
    key: string;
    name: string;
    description: string;
    layout: TableLayout;
};

const column = (
    key: string,
    label: string,
    type: 'text' | 'number' = 'text',
    group: string | null = null,
    band: string | null = null,
    sum = true,
    width: number | null = null,
) => ({ key, label, type, group, band, sum: type === 'number' && sum, width });

export const TABLE_PRESETS: TablePreset[] = [
    {
        key: 'planificacion',
        name: 'Planificación por unidades',
        description:
            'Formato oficial: contenidos, semanas, horas por semana (docencia y estudiante), actividades y evaluación. Una tabla por unidad con totales.',
        layout: {
            // Anchos en twips de la tabla del sílabo IA-SW-2026; las semanas no suman.
            columns: [
                column(
                    'contenidos',
                    'Contenidos temáticos de la unidad',
                    'text',
                    null,
                    null,
                    true,
                    2121,
                ),
                column(
                    'semana',
                    'Semanas (16)',
                    'number',
                    null,
                    'horas',
                    false,
                    427,
                ),
                column('acd', 'ACD', 'number', 'docencia', 'horas', true, 849),
                column(
                    'ape',
                    'APE',
                    'number',
                    'estudiante',
                    'horas',
                    true,
                    566,
                ),
                column('aa', 'AA', 'number', 'estudiante', 'horas', true, 566),
                column(
                    'act_acd',
                    'Aprendizaje en Contacto con el Docente (ACD)',
                    'text',
                    null,
                    'actividades',
                    true,
                    2553,
                ),
                column(
                    'act_ape',
                    'Aprendizaje práctico-experimental (APE)',
                    'text',
                    null,
                    'actividades',
                    true,
                    1843,
                ),
                column(
                    'act_aa',
                    'Aprendizaje autónomo (AA)',
                    'text',
                    null,
                    'actividades',
                    true,
                    2165,
                ),
                column(
                    'evaluacion',
                    'Evaluación de los aprendizajes',
                    'text',
                    null,
                    null,
                    true,
                    2266,
                ),
            ],
            groups: [
                { key: 'docencia', label: 'DOCENCIA' },
                { key: 'estudiante', label: 'ESTUDIANTE' },
            ],
            bands: [
                {
                    key: 'horas',
                    label: 'Horas por semana · Organización del aprendizaje',
                },
                { key: 'actividades', label: 'ACTIVIDADES DE APRENDIZAJE' },
            ],
            header_fields: [
                { key: 'nombre', label: 'Nombre de la unidad' },
                { key: 'resultados', label: 'Resultados de aprendizaje' },
            ],
            totals: { enabled: true, label: 'Total, horas' },
            repeat: { enabled: true, label: 'Unidad' },
        },
    },
    {
        key: 'bibliografia',
        name: 'Bibliografía',
        description: 'Autor, título, año, ciudad, editorial, ISBN y código.',
        layout: {
            columns: [
                column('autor', 'Autor'),
                column('titulo', 'Título'),
                column('anio', 'Año', 'number'),
                column('ciudad', 'Ciudad'),
                column('editorial', 'Editorial'),
                column('isbn', 'ISBN'),
                column('codigo', 'Código'),
            ],
            groups: [],
            bands: [],
            header_fields: [],
            totals: { enabled: false, label: 'Total' },
            repeat: { enabled: false, label: 'Unidad' },
        },
    },
    {
        key: 'escala',
        name: 'Escala de valoración',
        description:
            'Escala cualitativa, cuantitativa, equivalencia y valoración.',
        layout: {
            columns: [
                column('cualitativa', 'Escala cualitativa'),
                column('cuantitativa', 'Escala cuantitativa'),
                column('equivalencia', 'Equivalencias'),
                column('valoracion', 'Valoración de la asignatura'),
            ],
            groups: [],
            bands: [],
            header_fields: [],
            totals: { enabled: false, label: 'Total' },
            repeat: { enabled: false, label: 'Unidad' },
        },
    },
    {
        key: 'perfil',
        name: 'Perfil de egreso',
        description:
            'Resultado de la asignatura, nivel de contribución (alta, media, baja) y resultado del perfil.',
        layout: {
            columns: [
                column(
                    'resultado',
                    'Resultados de aprendizaje de la asignatura',
                ),
                column('alta', 'Alta', 'text', 'nivel'),
                column('media', 'Media', 'text', 'nivel'),
                column('baja', 'Baja', 'text', 'nivel'),
                column(
                    'perfil',
                    'Resultados de aprendizaje del perfil de egreso',
                ),
            ],
            groups: [{ key: 'nivel', label: 'Nivel de contribución' }],
            bands: [],
            header_fields: [],
            totals: { enabled: false, label: 'Total' },
            repeat: { enabled: false, label: 'Unidad' },
        },
    },
    {
        key: 'simple',
        name: 'Tabla simple',
        description: 'Dos columnas de texto para empezar desde cero.',
        layout: {
            columns: [
                column('columna_1', 'Columna 1'),
                column('columna_2', 'Columna 2'),
            ],
            groups: [],
            bands: [],
            header_fields: [],
            totals: { enabled: false, label: 'Total' },
            repeat: { enabled: false, label: 'Unidad' },
        },
    },
];

/** La tabla recién soltada todavía no tiene formato: una sola columna «texto». */
export const isUnformattedTable = (layout: TableLayout): boolean =>
    layout.columns.length === 1 &&
    layout.columns[0].key === 'texto' &&
    layout.header_fields.length === 0 &&
    !layout.totals.enabled &&
    !layout.repeat.enabled;
