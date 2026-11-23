import { api } from '@/api/client';
import type { AcademicStructureProps } from '@/types/academic';

export type AcademicGovernance = Pick<AcademicStructureProps, 'lock_reason' | 'catalogs' | 'options'> & {
  lock_reason: string | null;
  convocation_in_progress?: boolean;
  section: 'faculties' | 'careers' | 'academic-periods';
};

export type AcademicEntity = 'facultad' | 'carrera' | 'periodo';

export const getAcademicGovernance = () =>
  api<AcademicGovernance>('/admin/academic');
export const createAcademicRecord = (entity: AcademicEntity, payload: Record<string, unknown> | FormData) =>
  api<{ message: string; id?: string }>(`/admin/academic/${entity}`, {
    method: 'POST',
    body: payload instanceof FormData ? payload : JSON.stringify(payload),
  });
export const updateAcademicRecord = (entity: AcademicEntity, id: string, payload: Record<string, unknown> | FormData) => {
  if (payload instanceof FormData) {
    payload.set('_method', 'PATCH');
    return api<{ message: string }>(`/admin/academic/${entity}/${id}`, { method: 'POST', body: payload });
  }
  return api<{ message: string }>(`/admin/academic/${entity}/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
};
export const setAcademicRecordStatus = (entity: Exclude<AcademicEntity, 'periodo'>, id: string, active: boolean) =>
  api<{ message: string }>(`/admin/academic/${entity}/${id}/status`, { method: 'PATCH', body: JSON.stringify({ active }) });
export const deleteAcademicRecord = (entity: AcademicEntity, id: string) =>
  api<{ message: string }>(`/admin/academic/${entity}/${id}`, { method: 'DELETE' });
