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
    required?: boolean;
    show_if?: ResponseCondition | null;
    max_length?: number | null;
};
export const FIELD_EDITABILITY: Array<{ value: FieldResponsible; label: string }> = [
    { value: 'institucional', label: 'No editable' },
    { value: 'carrera', label: 'Editable' },
];
export const editabilityLabel = (value: StoredResponsible): string => value === 'institucional' ? 'No editable' : 'Editable';
export const emptyDocument = (): DocumentNode => ({ type: 'doc', content: [{ type: 'paragraph' }] });
