import { withPurgeConfirmation } from '@/api/career-academics';
import { api, apiBlob } from '@/api/client';
import { fichaImportPath } from '@/api/careerScope';

export type FichaTableValue = { columns: string[]; rows: string[][] };
export type FichaProposalValue = string | string[] | FichaTableValue;
export type FichaMissingField = { key: string; label: string; reason: 'no_encontrado' };

export type FichaWorkbookSubject = {
  subject_id: string;
  code: string;
  name: string;
  cycle: number | null;
  state: 'lista' | 'sin_evidencia';
  values: Record<string, FichaProposalValue>;
  coverage?: { found: number; total: number };
  missing?: FichaMissingField[];
  replaces: boolean;
  current: Record<string, string>;
};

export type FichaWorkbookPreview = {
  format: 'ficha_xlsx_v1';
  fingerprint: string;
  file_hash: string;
  fields: Array<{ key: string; label: string }>;
  subjects: FichaWorkbookSubject[];
};

export const applyFichaWorkbook = (file: File, preview: FichaWorkbookPreview, subjects: string[], fields?: Record<string, string[]>) =>
  withPurgeConfirmation((confirmPurge) => {
    const body = new FormData();
    body.append('file', file);
    body.append('fingerprint', preview.fingerprint);
    body.append('file_hash', preview.file_hash);
    subjects.forEach((subject) => body.append('subjects[]', subject));
    Object.entries(fields ?? {}).forEach(([subject, keys]) => keys.forEach((key) => body.append(`fields[${subject}][]`, key)));
    if (confirmPurge) body.append('confirm_purge', '1');

    return api<{ message: string; applied: number }>(fichaImportPath('/apply'), { method: 'POST', body });
  });

export const previewFichaWorkbook = (file: File) => {
  const body = new FormData();
  body.append('file', file);

  return api<{ preview: FichaWorkbookPreview }>(fichaImportPath('/spreadsheet'), { method: 'POST', body });
};

export const downloadFichaWorkbook = async (): Promise<void> => {
  const url = URL.createObjectURL(await apiBlob(fichaImportPath('/template')));
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = 'proyecto-carrera.xlsx';
    link.click();
  } finally { URL.revokeObjectURL(url); }
};
