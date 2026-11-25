import type { SyllabusField } from '@/api/syllabi';

/** Lo llena el docente: no es institucional y la plantilla le deja editarlo. */
export const isTeacherField = (field: SyllabusField): boolean => field.quien_llena !== 'institucional' && field.teacher_editable === true;

/** Un campo sin nombre toma el título de su sección. */
export const fieldTitle = (field: { label: string }, section: { title: string }): string => field.label.trim() || section.title;
