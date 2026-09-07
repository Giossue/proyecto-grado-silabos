import type { TableLayout, TableRowData } from '@/lib/tableLayout';
import type { DocumentField } from '@/lib/templateDocument';

// Synthetic preview only: never seed a teacher's answers with these values.
const samples: Record<string, string> = {
    discapacidad_tiene: 'No',
    discapacidad_tipo: 'No aplica.',
    discapacidad_adaptacion: 'No aplica.',
    formacion_experiencia:
        'Formación y experiencia en el área de la asignatura.',
    descripcion: 'Introducción a los fundamentos de la asignatura.',
    objetivo_general: 'Aplicar los conceptos estudiados a problemas prácticos.',
    estado_revision: 'Pendiente de revisión.',
    nombre: 'Unidad de ejemplo',
    resultados: 'Aplicar los conceptos estudiados.',
    contenidos: 'Introducción a la unidad.',
    act_acd: 'Clase guiada.',
    act_ape: 'Práctica.',
    act_aa: 'Lectura.',
    evaluacion: 'Ejercicio práctico.',
    autor: 'Autor de ejemplo',
    titulo: 'Obra de consulta',
};
const sampleText = (key: string): string | undefined =>
    Object.hasOwn(samples, key) ? samples[key] : undefined;

const sampleValue = (field: DocumentField): unknown => {
    const sample = sampleText(field.key);

    if (sample !== undefined) {
        return sample;
    }

    switch (field.type) {
        case 'numero':
        case 'calculo':
            return 2;
        case 'fecha':
            return '2026-03-01';
        case 'booleano':
            return false;
        case 'seleccion_unica':
            return field.options?.[0]?.value ?? 'Opción de ejemplo';
        case 'seleccion_multiple':
            return field.options?.length ? [field.options[0].value] : [];
        default:
            return 'Texto de ejemplo.';
    }
};

export function templatePreviewFields(
    fields: DocumentField[],
    layout: TableLayout | null,
): DocumentField[] {
    return fields.map((field) => {
        const rows: NonNullable<DocumentField['rows']> = [];

        if (field.type === 'repetible') {
            if (layout?.header_fields.length) {
                rows.push({
                    id: `sample-${field.key}-unit`,
                    data: {
                        _unit: 1,
                        _kind: 'unit',
                        ...Object.fromEntries(
                            layout.header_fields.map((header) => [
                                header.key,
                                sampleText(header.key) ?? 'Ejemplo breve.',
                            ]),
                        ),
                    },
                });
            }

            const data: TableRowData = layout
                ? Object.fromEntries(
                      layout.columns.map((column) => [
                          column.key,
                          column.type === 'number'
                              ? column.key === 'anio'
                                  ? 2026
                                  : column.key === 'semana'
                                    ? 1
                                    : 2
                              : (sampleText(column.key) ?? 'Ejemplo'),
                      ]),
                  )
                : { texto: 'Elemento de ejemplo.' };
            rows.push({ id: `sample-${field.key}-row`, data });
        }

        return { ...field, value: sampleValue(field), rows };
    });
}
