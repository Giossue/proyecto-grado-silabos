import type { ResponseCondition } from '@/lib/responseConditions';
import type { DocumentNode } from '@silabos/shared/lib/templateDocument';

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
    teacher_edits?: boolean;
    required?: boolean;
    show_if?: ResponseCondition | null;
    max_length?: number | null;
};
export type FieldFiller = FieldResponsible | 'docente';
export const FIELD_FILLERS: Array<{ value: FieldFiller; label: string }> = [
    { value: 'institucional', label: 'Nadie (texto fijo)' },
    { value: 'carrera', label: 'Coordinación' },
    { value: 'docente', label: 'Solo el docente' },
];
export const fieldFiller = (field: { quien_llena: StoredResponsible; teacher_only?: boolean }): FieldFiller =>
    field.quien_llena === 'institucional' ? 'institucional' : field.teacher_only ? 'docente' : 'carrera';
export const fillerLabel = (filler: FieldFiller): string => FIELD_FILLERS.find((item) => item.value === filler)!.label;
export const emptyDocument = (): DocumentNode => ({ type: 'doc', content: [{ type: 'paragraph' }] });
