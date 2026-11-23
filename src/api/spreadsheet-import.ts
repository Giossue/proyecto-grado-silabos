import { api, apiBlob } from '@/api/client';

export type ImportRow = { line: number; values: Record<string, string>; errors: string[] };
export type ImportResult = { rows: ImportRow[]; valid: boolean; created: number };
export type ImportKind = 'users' | 'careers' | 'teachers' | 'curriculum';

const imports: Record<ImportKind, { send: (body: FormData) => Promise<ImportResult>; template: () => Promise<Blob> }> = {
  users: {
    send: (body) => api<ImportResult>('/admin/users/import', { method: 'POST', body }),
    template: () => apiBlob('/admin/users/import-template'),
  },
  careers: {
    send: (body) => api<ImportResult>('/admin/academic/careers/import', { method: 'POST', body }),
    template: () => apiBlob('/admin/academic/careers/import-template'),
  },
  teachers: {
    send: (body) => api<ImportResult>('/coordination/academic/teachers/import', { method: 'POST', body }),
    template: () => apiBlob('/coordination/academic/teachers/import-template'),
  },
  curriculum: {
    send: (body) => api<ImportResult>('/coordination/academic/curriculum-import', { method: 'POST', body }),
    template: () => apiBlob('/coordination/academic/curriculum-import/template'),
  },
};

export const sendImport = (kind: ImportKind, file: File, confirm: boolean, extra: Record<string, string> = {}) => {
  const body = new FormData();
  Object.entries(extra).forEach(([key, value]) => body.append(key, value));
  body.append('file', file);
  body.append('confirm', confirm ? '1' : '0');

  return imports[kind].send(body);
};

export const downloadImportTemplate = async (kind: ImportKind, filename: string): Promise<void> => {
  const url = URL.createObjectURL(await imports[kind].template());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
