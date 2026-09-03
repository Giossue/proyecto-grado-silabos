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
) => ({ key, label, type, group, band });

export const TABLE_PRESETS: TablePreset[] = [
    {
        key: 'planificacion',
        name: 'Planificación por unidades',
        description:
            'Contenidos, horas por semana (docencia y estudiante), actividades y evaluación. Una tabla por unidad con totales.',
        layout: {
            columns: [
                column('contenidos', 'Contenidos temáticos de la unidad'),
                column('semana', 'Semanas', 'number', null, 'horas'),
                column('acd', 'ACD', 'number', 'docencia', 'horas'),
                column('ape', 'APE', 'number', 'estudiante', 'horas'),
                column('aa', 'AA', 'number', 'estudiante', 'horas'),
                column(
                    'act_acd',
                    'Aprendizaje en contacto con el docente (ACD)',
                    'text',
                    null,
                    'actividades',
                ),
                column(
                    'act_ape',
                    'Aprendizaje práctico-experimental (APE)',
                    'text',
                    null,
                    'actividades',
                ),
                column(
                    'act_aa',
                    'Aprendizaje autónomo (AA)',
                    'text',
                    null,
                    'actividades',
                ),
                column('evaluacion', 'Evaluación de los aprendizajes'),
            ],
            groups: [
                { key: 'docencia', label: 'Docencia' },
                { key: 'estudiante', label: 'Estudiante' },
            ],
            bands: [
                { key: 'horas', label: 'Horas por semana' },
                { key: 'actividades', label: 'Actividades de aprendizaje' },
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
