import type { ResponseCondition } from '@/lib/responseConditions';
import type { DocumentNode } from '@/lib/templateDocument';

export type FieldResponsible = 'carrera' | 'institucional';
export type StoredResponsible = FieldResponsible | 'docente' | 'coordinacion';
export type DocumentField = {
    id?: string;
    key: string;
    label: string;
    quien_llena: StoredResponsible;
    value: DocumentNode | null;
    document?: DocumentNode | null;
    template?: DocumentNode;
    teacher_editable?: boolean;
    required?: boolean;
    show_if?: ResponseCondition | null;
    max_length?: number | null;
};
export const FIELD_RESPONSIBLES: Array<{ value: FieldResponsible; label: string; hint: string }> = [
    { value: 'institucional', label: 'Institucional', hint: 'Contenido de la plantilla, igual para todos y de solo lectura' },
    { value: 'carrera', label: 'Carrera', hint: 'La carrera lo escribe en el proyecto de carrera de cada materia y el docente llena los espacios que le dejen' },
];
// La plantilla del admin solo dice si el campo se puede editar: «No editable» es Institucional y «Editable» es Carrera.
export const FIELD_EDITABILITY: Array<{ value: FieldResponsible; label: string }> = [
    { value: 'institucional', label: 'No editable' },
    { value: 'carrera', label: 'Editable' },
];
export const editabilityLabel = (value: StoredResponsible): string => value === 'institucional' ? 'No editable' : 'Editable';
export const responsibleLabel = (value: StoredResponsible): string => value === 'docente' || value === 'coordinacion'
    ? 'Carrera'
    : FIELD_RESPONSIBLES.find((item) => item.value === value)?.label ?? value;
export const emptyDocument = (): DocumentNode => ({ type: 'doc', content: [{ type: 'paragraph' }] });
