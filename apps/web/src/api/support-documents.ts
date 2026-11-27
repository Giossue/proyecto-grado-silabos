import { api, apiBlob } from '@/api/client';

export type SupportDocument = {
  id: string;
  title: string;
  size: number;
  view: 'pendiente' | 'lista' | 'sin_vista';
  uploaded_at: string;
};

export const getCoordinationSupportDocuments = () =>
  api<{ data: SupportDocument[] }>('/coordination/support-documents');

export const getTeacherSupportDocuments = () =>
  api<{ data: SupportDocument[] }>('/teacher/support-documents');

export const uploadSupportDocument = (title: string, file: File) => {
  const body = new FormData();
  body.append('title', title);
  body.append('file', file);

  return api<{ message: string; document: SupportDocument }>('/coordination/support-documents', { method: 'POST', body });
};

export const updateSupportDocument = (id: string, title: string, file: File | null) => {
  const body = new FormData();
  body.append('title', title);
  if (file !== null) body.append('file', file);

  return api<{ message: string }>(`/coordination/support-documents/${id}`, { method: 'POST', body });
};

export const deleteSupportDocument = (id: string) =>
  api<{ message: string }>(`/coordination/support-documents/${id}`, { method: 'DELETE' });

export const viewSupportDocument = (id: string) => apiBlob(`/support-documents/${id}/view`);
