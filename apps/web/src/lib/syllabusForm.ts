import type { SyllabusField } from '@/api/syllabi';
import type { DocumentNode } from '@silabos/shared/lib/templateDocument';
import { isSignatureVariable } from '@/lib/signatureVariables';

/** Lo llena el docente: no es institucional y la plantilla le deja editarlo. */
export const isTeacherField = (field: SyllabusField): boolean => field.quien_llena !== 'institucional' && field.teacher_editable === true;

/** Un campo sin nombre toma el título de su sección. */
export const fieldTitle = (field: { label: string }, section: { title: string }): string => field.label.trim() || section.title;

const hasSignature = (node: DocumentNode | null | undefined): boolean =>
  node?.type === 'variable' && isSignatureVariable(String(node.attrs?.id ?? '')) ? true : (node?.content ?? []).some(hasSignature);

export const isSignatureField = (field: SyllabusField): boolean => field.quien_llena === 'institucional' && hasSignature(field.value);

export const teacherFormFields = <F extends SyllabusField>(fields: F[]): F[] => fields.filter((field) => !isSignatureField(field));
